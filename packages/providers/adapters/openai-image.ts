/**
 * VHE-2 §7 — real OpenAI `image.inpaint` adapter (Images Edits API).
 *
 * POST {base}/images/edits, multipart/form-data, `Authorization: Bearer <key>`.
 * gpt-image-1 mask convention: fully-transparent (alpha 0) areas are edited; the mask must
 * match the image dimensions. Our §5 rasterized mask is white=edit on black, so we invert
 * it into an alpha mask (edit → transparent). gpt-image-1 returns `data[].b64_json` (never a
 * url) plus a `usage` token block. The call is synchronous → `submit` returns `immediate`.
 *
 * NOTE (0022): gpt-image-1 sometimes regenerates the whole crop rather than strictly the
 * masked pixels (documented OpenAI behavior). §9.1's crop→composite makes that safe — only
 * pixels inside the feathered mask are kept — but it is why we crop first and composite after.
 *
 * MIGRATED 2026-07-21 (Eli Q2a) off the `0022` storage factory-closure: the adapter now
 * reads its crop+mask input bytes through the versioned `ProviderExecutionContext`
 * (`ctx.readInput`) and returns PROVIDER-NATIVE bytes as a `ProviderNativeResult`. It no
 * longer persists anything or mints asset keys — the registry owns download/validate/store.
 */

import sharp from 'sharp';
import type { CapabilityManifest, GenRequest, ProviderAdapter } from '../types.ts';
import type { ProviderExecutionContext, ProviderNativeResult } from '../execution-context.ts';
import { ApiError, type ErrorCode } from '../../jobs/errors.ts';
import { lookupPricing } from '../cost-catalog.ts';

export interface OpenAIImageAdapterOpts {
  /** Default 'gpt-image-1'. dall-e-2 also works for accounts without gpt-image-1 verification. */
  model?: string;
  /** Injectable fetch for tests (no network). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Default 'https://api.openai.com/v1'. */
  apiBase?: string;
  maxWidth?: number;
  maxHeight?: number;
}

/** Invert our white=edit greyscale mask into OpenAI's alpha mask (edit → transparent). */
export async function toOpenAIAlphaMask(ourMaskPng: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(ourMaskPng).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 0;
    rgba[i * 4 + 1] = 0;
    rgba[i * 4 + 2] = 0;
    rgba[i * 4 + 3] = 255 - data[i]!; // keep(black=0)→opaque 255 ; edit(white=255)→transparent 0
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function mapHttp(status: number): ErrorCode {
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status === 400 || status === 422 || status === 401 || status === 403) return 'PROVIDER_REJECTED';
  return 'INTERNAL';
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}

/**
 * Best-effort cents estimate from the usage block; 0 if usage is absent/unrecognized.
 * Delegates to the versioned pricing catalog (single source of truth, Eli Q2c) — the rates
 * no longer live in this adapter. Kept as a named helper for the adapter's own unit test.
 */
export function estimateOpenAIImageCents(usage: unknown): number {
  const entry = lookupPricing('openai', 'gpt-image-1');
  return entry ? entry.estimateCents(usage as Record<string, unknown> | undefined) : 0;
}

export function makeOpenAIImageInpaintAdapter(opts: OpenAIImageAdapterOpts): ProviderAdapter {
  const model = opts.model ?? 'gpt-image-1';
  const base = opts.apiBase ?? 'https://api.openai.com/v1';
  const doFetch = opts.fetchImpl ?? fetch;
  const maxWidth = opts.maxWidth ?? 1536;
  const maxHeight = opts.maxHeight ?? 1536;

  return {
    slug: 'openai',
    async describeCapabilities(): Promise<CapabilityManifest> {
      return {
        providerSlug: 'openai',
        capabilities: {
          'image.inpaint': {
            maxWidth, maxHeight,
            supportsSeed: false, // Images Edits exposes no seed
            supportsNegativePrompt: false, // no negative_prompt field
            supportsMask: true,
            supportsReferenceImages: 0,
          },
        },
      };
    },
    async submit(
      key: string,
      req: GenRequest,
      ctx?: ProviderExecutionContext,
    ): Promise<{ immediate: ProviderNativeResult }> {
      if (!ctx) {
        throw new ApiError('INTERNAL', 500, 'openai image adapter requires a ProviderExecutionContext (ctx.readInput)');
      }
      const src = await ctx.readInput(req.sourceImageKey!);
      const ourMask = await ctx.readInput(req.maskKey!);
      const srcPng = await sharp(src).png().toBuffer();
      const alphaMask = await toOpenAIAlphaMask(ourMask);
      const n = Math.max(1, Math.min(10, Number((req.extra as any)?.candidateCount) || 1));

      const form = new FormData();
      form.append('model', model);
      form.append('prompt', req.prompt);
      form.append('n', String(n));
      form.append('output_format', 'png');
      form.append('image', new Blob([srcPng], { type: 'image/png' }), 'image.png');
      form.append('mask', new Blob([alphaMask], { type: 'image/png' }), 'mask.png');

      const res = await doFetch(`${base}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) {
        throw new ApiError(mapHttp(res.status), res.status, `openai images/edits ${res.status}: ${await safeText(res)}`);
      }
      const j = (await res.json()) as { data?: { b64_json?: string }[]; usage?: unknown };
      const items = Array.isArray(j.data) ? j.data : [];
      const outputs = items
        .filter((it) => it.b64_json)
        .map((it) => ({ kind: 'bytes' as const, bytes: Buffer.from(it.b64_json!, 'base64'), mimeType: 'image/png' }));
      if (outputs.length === 0) {
        throw new ApiError('PROVIDER_REJECTED', 422, 'openai returned no image data');
      }
      // Provider-native result. OpenAI returns NO exact cost → reportedCostCents left unset;
      // the pricing catalog estimates from `usage` (raw usage + model carried through).
      return { immediate: { outputs, model, usage: (j.usage as Record<string, unknown>) ?? undefined, raw: { usage: j.usage } } };
    },
    async poll(): Promise<never> {
      throw new Error('openai image edits are synchronous; poll is unused');
    },
  };
}
