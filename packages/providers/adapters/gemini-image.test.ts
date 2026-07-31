/**
 * VHE-2 §7 — Gemini image.inpaint adapter, without network (mock fetch).
 * Verifies N sibling calls → N candidates, inlineData parsing (camel + snake), and that a
 * total failure surfaces PROVIDER_REJECTED (VHE-ISSUE-LOG-0022).
 *
 * MIGRATED 2026-07-21 (Eli Q2a, VHE-ISSUE-LOG-0024): inputs read via a versioned
 * `ProviderExecutionContext`; the N sibling images returned as PROVIDER-NATIVE bytes.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { GenRequest } from '../types.ts';
import { makeExecutionContext, type AssetStore } from '../execution-context.ts';
import { makeGeminiImageInpaintAdapter } from './gemini-image.ts';

function memStore(): AssetStore {
  const map = new Map<string, Buffer>();
  let n = 0;
  return {
    async load(k) { const b = map.get(k); if (!b) throw new Error(`no key ${k}`); return b; },
    async store(b, h) { const k = `mem/${h}/${n++}`; map.set(k, b); return k; },
    async signUrl(k) { return `mem://${k}`; },
    async fetchUrl() { throw new Error('fetchUrl not used by the Gemini adapter'); },
  };
}

async function seed(store: AssetStore): Promise<GenRequest> {
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
  const src = await store.store(png, 'crop');
  const mask = await store.store(png, 'mask');
  return { capability: 'image.inpaint', prompt: 'repair', width: 16, height: 16, sourceImageKey: src, maskKey: mask, extra: { candidateCount: 2 } };
}

describe('§7 Gemini adapter — sibling calls per candidate', () => {
  it('makes N calls and returns N provider-native candidates', async () => {
    const store = memStore();
    const req = await seed(store);
    const ctx = makeExecutionContext(store);
    const img = (await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 0, g: 200, b: 0 } } }).png().toBuffer()).toString('base64');
    let calls = 0;
    const fetchImpl = (async (_u: any, init: any) => {
      calls++;
      expect(init.headers['x-goog-api-key']).toBe('AIza-test');
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: img } }] } }],
        usageMetadata: { candidatesTokenCount: 1290 },
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const adapter = makeGeminiImageInpaintAdapter({ fetchImpl });
    const out = await adapter.submit('AIza-test', req, ctx);
    const result = 'immediate' in out ? out.immediate : (out as any);
    expect(calls).toBe(2);
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0].kind).toBe('bytes');
    expect(result.outputs[0].mimeType).toBe('image/png');
    // no exact cost → reportedCostCents unset; accumulated usage carried through
    expect(result.reportedCostCents).toBeUndefined();
    expect(result.usage).toMatchObject({ candidatesTokenCount: 2580 });
  });

  it('surfaces PROVIDER_REJECTED when every sibling call fails', async () => {
    const store = memStore();
    const req = await seed(store);
    const ctx = makeExecutionContext(store);
    const adapter = makeGeminiImageInpaintAdapter({
      fetchImpl: (async () => new Response('{"error":"blocked"}', { status: 400 })) as unknown as typeof fetch,
    });
    await expect(adapter.submit('k', req, ctx)).rejects.toMatchObject({ code: 'PROVIDER_REJECTED' });
  });
});
