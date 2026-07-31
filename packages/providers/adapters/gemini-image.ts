/**
 * VHE-2 §7 — real Google Gemini `image.inpaint` adapter (generativelanguage generateContent).
 *
 * Gemini 2.5 Flash Image ("nano-banana") does INSTRUCTION-based editing, not a mask channel.
 * §9.1 still enforces the mask on our side (crop → composite under the feathered mask), so we
 * send the crop + the mask image + a prompt that asks the model to restrict edits to the white
 * mask region (best-effort guidance), and `compositeUnderMask` remains the hard enforcement.
 *
 * Gemini returns ONE image per call, so to honor §9.1's "2–4 candidates" we make N separate
 * tracked sibling calls (Marcus's ruling: sibling calls, never silently fewer) and collect the
 * images. Synchronous → `submit` returns `immediate`. Auth via the `x-goog-api-key` header so
 * the key never lands in a URL/query string (0022).
 *
 * MIGRATED 2026-07-21 (Eli Q2a) off the `0022` storage factory-closure: input crop+mask bytes
 * are read via the versioned `ProviderExecutionContext` (`ctx.readInput`); the N sibling images
 * are returned as PROVIDER-NATIVE bytes in a `ProviderNativeResult`. The registry owns
 * download/validate/store; the adapter no longer persists or mints keys.
 */

import type { CapabilityManifest, GenRequest, ProviderAdapter } from '../types.ts';
import type { ProviderExecutionContext, ProviderNativeOutput, ProviderNativeResult } from '../execution-context.ts';
import { ApiError, type ErrorCode } from '../../jobs/errors.ts';
import { lookupPricing } from '../cost-catalog.ts';

export interface GeminiImageAdapterOpts {
  /** Default 'gemini-2.5-flash-image'. */
  model?: string;
  fetchImpl?: typeof fetch;
  /** Default 'https://generativelanguage.googleapis.com/v1beta'. */
  apiBase?: string;
  maxWidth?: number;
  maxHeight?: number;
}

function mapHttp(status: number): ErrorCode {
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status === 400 || status === 403 || status === 401) return 'PROVIDER_REJECTED';
  return 'INTERNAL';
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 500); } catch { return '<no body>'; }
}

/** Pull the first inline image (camelCase or snake_case) out of a generateContent response. */
function firstInlineImage(j: any): string | undefined {
  const parts = j?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    if (inline?.data) return inline.data as string;
  }
  return undefined;
}

/**
 * Best-effort cents estimate from usageMetadata; delegates to the versioned pricing catalog
 * (single source of truth, Eli Q2c). Kept as a named helper for parity with the OpenAI adapter.
 */
export function estimateGeminiImageCents(usageMetadata: unknown): number {
  const entry = lookupPricing('google', 'gemini-2.5-flash-image');
  return entry ? entry.estimateCents(usageMetadata as Record<string, unknown> | undefined) : 0;
}

export function makeGeminiImageInpaintAdapter(opts: GeminiImageAdapterOpts): ProviderAdapter {
  const model = opts.model ?? 'gemini-2.5-flash-image';
  const base = opts.apiBase ?? 'https://generativelanguage.googleapis.com/v1beta';
  const doFetch = opts.fetchImpl ?? fetch;
  const maxWidth = opts.maxWidth ?? 1024;
  const maxHeight = opts.maxHeight ?? 1024;

  async function oneCall(key: string, prompt: string, cropB64: string, maskB64: string): Promise<{ img: string; usage: unknown }> {
    const body = {
      contents: [{
        parts: [
          { inlineData: { mimeType: 'image/png', data: cropB64 } },
          { inlineData: { mimeType: 'image/png', data: maskB64 } },
          { text: `${prompt} Edit ONLY the region indicated by the white area of the second (mask) image; leave everything else untouched.` },
        ],
      }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    };
    const res = await doFetch(`${base}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ApiError(mapHttp(res.status), res.status, `gemini generateContent ${res.status}: ${await safeText(res)}`);
    }
    const j = await res.json();
    const img = firstInlineImage(j);
    if (!img) throw new ApiError('PROVIDER_REJECTED', 422, 'gemini returned no inline image (safety block or text-only)');
    return { img, usage: j.usageMetadata };
  }

  return {
    slug: 'google',
    async describeCapabilities(): Promise<CapabilityManifest> {
      return {
        providerSlug: 'google',
        capabilities: {
          'image.inpaint': {
            maxWidth, maxHeight,
            supportsSeed: false,
            supportsNegativePrompt: false,
            supportsMask: true, // mask hinted to the model + hard-enforced by §9.1 compositing
            supportsReferenceImages: 1,
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
        throw new ApiError('INTERNAL', 500, 'gemini image adapter requires a ProviderExecutionContext (ctx.readInput)');
      }
      const cropB64 = (await ctx.readInput(req.sourceImageKey!)).toString('base64');
      const maskB64 = (await ctx.readInput(req.maskKey!)).toString('base64');
      const n = Math.max(1, Math.min(4, Number((req.extra as any)?.candidateCount) || 1));

      const outputs: ProviderNativeOutput[] = [];
      let candidatesTokenCount = 0;
      let lastErr: unknown;
      for (let i = 0; i < n; i++) {
        try {
          const { img, usage } = await oneCall(key, req.prompt, cropB64, maskB64);
          outputs.push({ kind: 'bytes', bytes: Buffer.from(img, 'base64'), mimeType: 'image/png' });
          candidatesTokenCount += (usage as { candidatesTokenCount?: number } | undefined)?.candidatesTokenCount ?? 0;
        } catch (err) {
          lastErr = err; // one sibling failing shouldn't sink the others
        }
      }
      if (outputs.length === 0) {
        throw lastErr instanceof ApiError ? lastErr : new ApiError('PROVIDER_REJECTED', 422, 'gemini produced no candidates');
      }
      // Native result. Gemini returns no exact cost → reportedCostCents unset; the catalog
      // estimates from the accumulated `candidatesTokenCount` usage.
      return {
        immediate: {
          outputs,
          model,
          usage: { candidatesTokenCount },
          raw: { requested: n, returned: outputs.length },
        },
      };
    },
    async poll(): Promise<never> {
      throw new Error('gemini generateContent is synchronous; poll is unused');
    },
  };
}
