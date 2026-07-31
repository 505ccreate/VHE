/**
 * VHE-2 §7 — real fal.ai `image.inpaint` adapter (queue API).
 *
 * fal is slug 'fal' and is FIRST in the §7 visual fallback order (VHE-ISSUE-LOG-0018), but it
 * was reference-only until the owner provisioned a key (2026-07-23). This is the first REAL fal
 * adapter, and the first adapter of ANY kind that:
 *   • is ASYNCHRONOUS — it uses fal's queue API (submit → poll status → fetch result), so it
 *     drives the registry's `poll` path (openai/gemini are synchronous `immediate` calls); and
 *   • is URL-in / URL-out — fal fetches its inputs by URL and returns its outputs as URLs. It
 *     therefore uses `ctx.signInputUrl(...)` for the source image + mask (the Eli-Q2a seam that
 *     existed for exactly this case) and returns provider-native `{ kind:'url' }` outputs that
 *     the registry downloads via `store.fetchUrl` in `normalizeToAssetKeys`.
 *
 * VERIFIED TRANSPORT (fal queue docs, https://fal.ai/docs/model-endpoints/queue, 2026-07-23):
 *   submit  POST   {base}/{modelId}                                → { request_id, status_url, ... }
 *   status  GET    {base}/{modelId}/requests/{id}/status           → { status: IN_QUEUE|IN_PROGRESS|COMPLETED, ... }
 *   result  GET    {base}/{modelId}/requests/{id}                  → model-specific output JSON
 *   auth    header `Authorization: Key <FAL_KEY>`
 *
 * MODEL CONTRACT VERIFIED (official fal model API page, 2026-07-23):
 * `fal-ai/flux-general/inpainting` accepts `image_url`, `mask_url`, `prompt`, `num_images`,
 * custom `image_size`, optional `seed`, and optional `negative_prompt`; output is
 * `images[].url`. The model remains `opts.model`-configurable, but an override must use the same
 * schema or a separate adapter. Live repair quality and billed cost remain unverified. See
 * VHE-ISSUE-LOG-0026 correction.
 *
 * MASK CONVENTION: fal flux inpainting inpaints the WHITE region of `mask_url`. Our §5 rasterized
 * mask is already white=edit on black, so — unlike the OpenAI adapter — NO inversion is needed;
 * the signed mask URL is passed through as-is. §9.1's crop→composite-under-feathered-mask remains
 * the hard enforcement regardless of how faithfully the provider honors the mask.
 *
 * COST: fal returns no authoritative per-call cost in the queue result, and there is no confirmed
 * fal rate yet (the model is unchosen). Deliberately NO cost-catalog entry is added — an invented
 * rate would be worse than the honest fallback. `lookupPricing('fal', ...)` therefore misses and
 * the registry falls back to the §7 per-capability chain-head default (cost-defaults.ts), with the
 * estimate marked `authoritative:'dashboard'`. Add a fal pricing entry once the model is confirmed
 * and a real dashboard figure exists (VHE-ISSUE-LOG-0026).
 */

import type { CapabilityManifest, GenRequest, ProviderAdapter } from '../types.ts';
import type { ProviderExecutionContext, ProviderNativeOutput, ProviderNativeResult } from '../execution-context.ts';
import { ApiError, type ErrorCode } from '../../jobs/errors.ts';

export interface FalImageAdapterOpts {
  /**
   * fal model id. Default contract verified against the official model API page on 2026-07-23.
   * An override must expose the same request/response schema.
   */
  model?: string;
  /** Injectable fetch for tests (no network). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Default 'https://queue.fal.run'. */
  apiBase?: string;
  /** Short-lived input-URL TTL handed to `ctx.signInputUrl` (fal must be able to fetch it). */
  inputUrlTtlSec?: number;
  maxWidth?: number;
  maxHeight?: number;
}

const DEFAULT_MODEL = 'fal-ai/flux-general/inpainting';

function mapHttp(status: number): ErrorCode {
  if (status === 429) return 'PROVIDER_RATE_LIMIT';
  if (status === 400 || status === 401 || status === 403 || status === 422) return 'PROVIDER_REJECTED';
  return 'INTERNAL';
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}

/** One fal-native output image, as returned in the queue result's `images` array. */
interface FalImage {
  url?: string;
  content_type?: string;
  width?: number;
  height?: number;
}

export function makeFalImageInpaintAdapter(opts: FalImageAdapterOpts = {}): ProviderAdapter {
  const model = opts.model ?? DEFAULT_MODEL;
  const base = (opts.apiBase ?? 'https://queue.fal.run').replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  const ttl = opts.inputUrlTtlSec ?? 300;
  const maxWidth = opts.maxWidth ?? 1024;
  const maxHeight = opts.maxHeight ?? 1024;

  const authHeader = (key: string) => ({ Authorization: `Key ${key}` });
  const submitUrl = () => `${base}/${model}`;
  const statusUrl = (id: string) => `${base}/${model}/requests/${id}/status`;
  const resultUrl = (id: string) => `${base}/${model}/requests/${id}`;

  return {
    slug: 'fal',
    async describeCapabilities(): Promise<CapabilityManifest> {
      return {
        providerSlug: 'fal',
        capabilities: {
          'image.inpaint': {
            maxWidth,
            maxHeight,
            supportsSeed: true, // fal flux inpainting accepts a `seed`
            supportsNegativePrompt: true, // official endpoint accepts `negative_prompt`
            supportsMask: true, // native mask_url (white = inpaint); §9.1 still hard-enforces
            supportsReferenceImages: 1, // official endpoint accepts `reference_image_url`
          },
        },
      };
    },

    async submit(
      key: string,
      req: GenRequest,
      ctx?: ProviderExecutionContext,
    ): Promise<{ providerJobId: string }> {
      if (!ctx) {
        throw new ApiError('INTERNAL', 500, 'fal image adapter requires a ProviderExecutionContext (ctx.signInputUrl)');
      }
      if (!req.sourceImageKey || !req.maskKey) {
        throw new ApiError('INTERNAL', 500, 'fal image.inpaint requires sourceImageKey and maskKey');
      }
      // fal fetches inputs by URL → sign short-lived URLs for the crop + the (white=edit) mask.
      // NOTE: these must be PUBLICLY reachable by fal's servers (presigned S3 in production). A
      // local-path store cannot satisfy that — see VHE-ISSUE-LOG-0026 (live-validation prereqs).
      const imageUrl = await ctx.signInputUrl(req.sourceImageKey, { ttlSec: ttl });
      const maskUrl = await ctx.signInputUrl(req.maskKey, { ttlSec: ttl });
      if ((req.referenceImageKeys?.length ?? 0) > 1) {
        throw new ApiError('PROVIDER_REJECTED', 422, 'fal image.inpaint accepts at most one reference image');
      }
      const referenceImageUrl = req.referenceImageKeys?.[0]
        ? await ctx.signInputUrl(req.referenceImageKeys[0], { ttlSec: ttl })
        : undefined;
      const n = Math.max(1, Math.min(4, Number((req.extra as any)?.candidateCount) || 1));

      const body: Record<string, unknown> = {
        prompt: req.prompt,
        image_url: imageUrl,
        mask_url: maskUrl, // white = inpaint; our §5 mask already matches → no inversion
        image_size: { width: req.width, height: req.height },
        num_images: n,
      };
      if (req.seed !== undefined) body.seed = req.seed;
      if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
      if (referenceImageUrl) body.reference_image_url = referenceImageUrl;

      const res = await doFetch(submitUrl(), {
        method: 'POST',
        headers: { ...authHeader(key), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new ApiError(mapHttp(res.status), res.status, `fal submit ${res.status}: ${await safeText(res)}`);
      }
      const j = (await res.json()) as { request_id?: string };
      if (!j.request_id) {
        throw new ApiError('PROVIDER_REJECTED', 422, 'fal submit returned no request_id');
      }
      return { providerJobId: j.request_id };
    },

    async poll(
      key: string,
      providerJobId: string,
      _ctx?: ProviderExecutionContext,
    ): Promise<
      | { status: 'running'; progress?: number }
      | { status: 'succeeded'; result: ProviderNativeResult }
      | { status: 'failed'; error: string }
    > {
      const sres = await doFetch(statusUrl(providerJobId), { method: 'GET', headers: authHeader(key) });
      if (!sres.ok) {
        // A 4xx/5xx on the status endpoint is a real failure (e.g. bad request id, auth) — map it
        // to a §4.3 code so the chain records it and (for retryable codes) falls through.
        throw new ApiError(mapHttp(sres.status), sres.status, `fal status ${sres.status}: ${await safeText(sres)}`);
      }
      const s = (await sres.json()) as { status?: string; queue_position?: number };

      if (s.status === 'IN_QUEUE' || s.status === 'IN_PROGRESS') {
        return { status: 'running' };
      }
      if (s.status !== 'COMPLETED') {
        // Any other terminal/unknown status is treated as an honest failure, never a silent drop.
        return { status: 'failed', error: `fal returned unexpected status '${s.status ?? '(none)'}'` };
      }

      const rres = await doFetch(resultUrl(providerJobId), { method: 'GET', headers: authHeader(key) });
      if (!rres.ok) {
        // COMPLETED-but-error: fal surfaces a failed run as a non-2xx result body.
        return { status: 'failed', error: `fal result ${rres.status}: ${await safeText(rres)}` };
      }
      const r = (await rres.json()) as { images?: FalImage[]; seed?: number; has_nsfw_concepts?: boolean[]; timings?: unknown };
      const images = Array.isArray(r.images) ? r.images.filter((im): im is FalImage & { url: string } => typeof im?.url === 'string' && im.url.length > 0) : [];
      if (images.length === 0) {
        return { status: 'failed', error: 'fal result contained no image urls' };
      }
      const outputs: ProviderNativeOutput[] = images.map((im) => ({
        kind: 'url',
        url: im.url,
        mimeType: im.content_type ?? 'image/png',
      }));
      // fal returns no exact cost → reportedCostCents left unset (catalog/dashboard estimate).
      const result: ProviderNativeResult = {
        outputs,
        seedUsed: typeof r.seed === 'number' ? r.seed : undefined,
        providerJobId,
        model,
        usage: { num_images: images.length },
        raw: { timings: r.timings, has_nsfw_concepts: r.has_nsfw_concepts },
      };
      return { status: 'succeeded', result };
    },

    async cancel(key: string, providerJobId: string): Promise<void> {
      // fal cancel is PUT {base}/{modelId}/requests/{id}/cancel; best-effort, errors swallowed.
      try {
        await doFetch(`${base}/${model}/requests/${providerJobId}/cancel`, { method: 'PUT', headers: authHeader(key) });
      } catch {
        /* best-effort */
      }
    },
  };
}
