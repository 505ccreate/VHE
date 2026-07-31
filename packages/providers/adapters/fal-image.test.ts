/**
 * VHE-2 §7 — fal.ai image.inpaint adapter, exercised WITHOUT network (mock fetch).
 *
 * fal is the first ASYNC adapter (queue: submit → poll → result) and the first URL-in/URL-out
 * adapter, so these tests verify things the openai/gemini tests don't: that inputs are signed via
 * `ctx.signInputUrl` (never read as bytes), that the queue submit/status/result URLs and the
 * `Authorization: Key` header are exactly right, that IN_QUEUE/IN_PROGRESS map to `running` and
 * COMPLETED maps to `succeeded` with provider-native URL outputs, and that those URL outputs flow
 * through `normalizeToAssetKeys` (the registry's download side) into assetKeys. No cent is spent.
 */

import { describe, expect, it, vi } from 'vitest';
import type { GenRequest } from '../types.ts';
import { normalizeToAssetKeys, type AssetStore, type ProviderExecutionContext } from '../execution-context.ts';
import { makeFalImageInpaintAdapter } from './fal-image.ts';

/** A ctx that records which keys were signed and never exposes bytes (fal is URL-in). */
function signingCtx(): { ctx: ProviderExecutionContext; signed: string[] } {
  const signed: string[] = [];
  const ctx: ProviderExecutionContext = {
    version: 1,
    async readInput() {
      throw new Error('fal must not read input bytes — it signs URLs');
    },
    async signInputUrl(key, opts) {
      signed.push(key);
      return `https://signed.example/${encodeURIComponent(key)}?ttl=${opts?.ttlSec ?? 0}`;
    },
  };
  return { ctx, signed };
}

const req = (extra?: Record<string, unknown>): GenRequest => ({
  capability: 'image.inpaint',
  prompt: 'restore the melted hand to a single natural hand',
  width: 512,
  height: 512,
  sourceImageKey: 'inp/crop.png',
  maskKey: 'inp/mask.png',
  extra,
});

describe('§7 fal adapter — submit (mock fetch)', () => {
  it('signs both inputs, posts the queue request with Key auth, returns the request_id', async () => {
    const { ctx, signed } = signingCtx();
    let seenUrl = '';
    let seenAuth = '';
    let seenCT = '';
    let seenBody: any = null;
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      seenUrl = String(url);
      seenAuth = init.headers.Authorization;
      seenCT = init.headers['Content-Type'];
      seenBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ request_id: 'req-123', status_url: 'x' }), { status: 200 });
    }) as unknown as typeof fetch;

    const adapter = makeFalImageInpaintAdapter({ fetchImpl });
    const out = await adapter.submit(
      'fal-KEY',
      { ...req({ candidateCount: 3 }), referenceImageKeys: ['reference/shared.png'] },
      ctx,
    );

    expect(out).toEqual({ providerJobId: 'req-123' });
    expect(seenUrl).toBe('https://queue.fal.run/fal-ai/flux-general/inpainting');
    expect(seenAuth).toBe('Key fal-KEY');
    expect(seenCT).toBe('application/json');
    // inputs were SIGNED (URL-in), not read as bytes; body carries the signed urls
    expect(signed).toEqual(['inp/crop.png', 'inp/mask.png', 'reference/shared.png']);
    expect(seenBody.image_url).toContain('crop.png');
    expect(seenBody.mask_url).toContain('mask.png');
    expect(seenBody.prompt).toContain('melted hand');
    expect(seenBody.image_size).toEqual({ width: 512, height: 512 });
    expect(seenBody.reference_image_url).toContain('reference%2Fshared.png');
    expect(seenBody.num_images).toBe(3);
  });

  it('passes optional seed and negative prompt, and clamps candidate count to 1..4', async () => {
    const { ctx } = signingCtx();
    let body: any = null;
    const fetchImpl = (async (_u: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ request_id: 'r' }), { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = makeFalImageInpaintAdapter({ fetchImpl });

    await adapter.submit(
      'k',
      { ...req({ candidateCount: 99 }), seed: 42, negativePrompt: 'extra fingers, distorted anatomy' },
      ctx,
    );
    expect(body.seed).toBe(42);
    expect(body.negative_prompt).toBe('extra fingers, distorted anatomy');
    expect(body.num_images).toBe(4); // clamped

    await adapter.submit('k', req({ candidateCount: 0 }), ctx);
    expect('seed' in body).toBe(false); // no seed on the request → not sent
    expect('negative_prompt' in body).toBe(false);
    expect(body.num_images).toBe(1); // clamped up from 0
  });

  it('maps a 429 to PROVIDER_RATE_LIMIT and a 400 to PROVIDER_REJECTED', async () => {
    const { ctx } = signingCtx();
    const make = (status: number) =>
      makeFalImageInpaintAdapter({ fetchImpl: (async () => new Response('{"detail":"no"}', { status })) as unknown as typeof fetch });
    await expect(make(429).submit('k', req(), ctx)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT' });
    await expect(make(400).submit('k', req(), ctx)).rejects.toMatchObject({ code: 'PROVIDER_REJECTED' });
  });

  it('throws INTERNAL when no execution context is supplied (fal cannot sign inputs)', async () => {
    const adapter = makeFalImageInpaintAdapter({ fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch });
    await expect(adapter.submit('k', req())).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('§7 fal adapter — poll (mock fetch)', () => {
  const okStatus = (status: string) =>
    (async (url: any) =>
      String(url).endsWith('/status')
        ? new Response(JSON.stringify({ status }), { status: 200 })
        : new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;

  it('maps IN_QUEUE and IN_PROGRESS to running', async () => {
    const a = makeFalImageInpaintAdapter({ fetchImpl: okStatus('IN_QUEUE') });
    expect(await a.poll('k', 'req-1')).toEqual({ status: 'running' });
    const b = makeFalImageInpaintAdapter({ fetchImpl: okStatus('IN_PROGRESS') });
    expect(await b.poll('k', 'req-1')).toEqual({ status: 'running' });
  });

  it('on COMPLETED fetches the result and returns provider-native URL outputs', async () => {
    let statusUrl = '';
    let resultUrl = '';
    const fetchImpl = (async (url: any, init: any) => {
      const u = String(url);
      expect(init.headers.Authorization).toBe('Key k'); // both calls carry auth
      if (u.endsWith('/status')) {
        statusUrl = u;
        return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
      }
      resultUrl = u;
      return new Response(
        JSON.stringify({
          images: [
            { url: 'https://cdn.fal/one.png', content_type: 'image/png', width: 512, height: 512 },
            { url: 'https://cdn.fal/two.png', content_type: 'image/png' },
          ],
          seed: 7,
          timings: { inference: 1.2 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const a = makeFalImageInpaintAdapter({ fetchImpl });
    const p = await a.poll('k', 'req-XYZ');
    expect(statusUrl).toBe('https://queue.fal.run/fal-ai/flux-general/inpainting/requests/req-XYZ/status');
    expect(resultUrl).toBe('https://queue.fal.run/fal-ai/flux-general/inpainting/requests/req-XYZ');
    expect(p.status).toBe('succeeded');
    if (p.status !== 'succeeded') return;
    expect(p.result.outputs).toHaveLength(2);
    expect(p.result.outputs[0]).toEqual({ kind: 'url', url: 'https://cdn.fal/one.png', mimeType: 'image/png' });
    expect(p.result.seedUsed).toBe(7);
    expect(p.result.model).toBe('fal-ai/flux-general/inpainting');
    expect(p.result.reportedCostCents).toBeUndefined(); // fal gives no exact cost
  });

  it('reports failed (not a silent drop) when COMPLETED has no images', async () => {
    const fetchImpl = (async (url: any) =>
      String(url).endsWith('/status')
        ? new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        : new Response(JSON.stringify({ images: [] }), { status: 200 })) as unknown as typeof fetch;
    const a = makeFalImageInpaintAdapter({ fetchImpl });
    const p = await a.poll('k', 'req-1');
    expect(p.status).toBe('failed');
  });

  it('reports failed when the result endpoint errors on a COMPLETED job', async () => {
    const fetchImpl = (async (url: any) =>
      String(url).endsWith('/status')
        ? new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        : new Response('{"detail":"run failed"}', { status: 500 })) as unknown as typeof fetch;
    const a = makeFalImageInpaintAdapter({ fetchImpl });
    const p = await a.poll('k', 'req-1');
    expect(p.status).toBe('failed');
    if (p.status === 'failed') expect(p.error).toContain('500');
  });

  it('throws a mapped ApiError when the status endpoint itself errors', async () => {
    const a = makeFalImageInpaintAdapter({ fetchImpl: (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch });
    await expect(a.poll('k', 'req-1')).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT' });
  });
});

describe('§7 fal adapter — URL outputs normalize to assetKeys (registry download side)', () => {
  it('a COMPLETED result flows through normalizeToAssetKeys into stored keys', async () => {
    const fetchImpl = (async (url: any) =>
      String(url).endsWith('/status')
        ? new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
        : new Response(JSON.stringify({ images: [{ url: 'https://cdn.fal/out.png', content_type: 'image/png' }], seed: 3 }), { status: 200 })) as unknown as typeof fetch;

    const a = makeFalImageInpaintAdapter({ fetchImpl });
    const p = await a.poll('k', 'req-1');
    expect(p.status).toBe('succeeded');
    if (p.status !== 'succeeded') return;

    // The registry-side store: fal URL outputs are downloaded via fetchUrl, then stored.
    const stored: Buffer[] = [];
    const store: AssetStore = {
      async load() { throw new Error('unused'); },
      async signUrl(key) { return key; },
      async store(bytes, hint) { stored.push(bytes); return `asset/${hint}/${stored.length - 1}`; },
      async fetchUrl(url) {
        expect(url).toBe('https://cdn.fal/out.png');
        return Buffer.from('PNGBYTES');
      },
    };
    const gen = await normalizeToAssetKeys(p.result, store, { hint: 'fal-output', contract: { minOutputs: 1, expectMimePrefix: 'image' } });
    expect(gen.assetKeys).toHaveLength(1);
    expect(gen.assetKeys[0]).toMatch(/^asset\/fal-output-/);
    expect(gen.seedUsed).toBe(3);
    expect(stored[0]!.toString()).toBe('PNGBYTES');
  });
});
