/**
 * VHE-2 §7 — OpenAI image.inpaint adapter, exercised WITHOUT network (mock fetch).
 * De-risks the real paid call: verifies the mask inversion, the multipart request shape,
 * response parsing, and error mapping before a cent is spent (VHE-ISSUE-LOG-0022).
 *
 * MIGRATED 2026-07-21 (Eli Q2a, VHE-ISSUE-LOG-0024): the adapter now reads inputs via a
 * versioned `ProviderExecutionContext` and returns PROVIDER-NATIVE bytes (not stored keys).
 * These tests assert the native-output contract; store→assetKey conversion is covered by
 * execution-context.test.ts.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { GenRequest } from '../types.ts';
import { makeExecutionContext, type AssetStore } from '../execution-context.ts';
import {
  estimateOpenAIImageCents,
  makeOpenAIImageInpaintAdapter,
  toOpenAIAlphaMask,
} from './openai-image.ts';

function solid(w: number, h: number, c: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
}

/** Minimal in-memory AssetStore. Only load/store are exercised by an image adapter's ctx. */
function memStore(): AssetStore & { map: Map<string, Buffer> } {
  const map = new Map<string, Buffer>();
  let n = 0;
  return {
    map,
    async load(key) {
      const b = map.get(key);
      if (!b) throw new Error(`no key ${key}`);
      return b;
    },
    async store(bytes, hint) {
      const k = `mem/${hint}/${n++}`;
      map.set(k, bytes);
      return k;
    },
    async signUrl(key) {
      return `mem://${key}`;
    },
    async fetchUrl() {
      throw new Error('fetchUrl not used by the OpenAI adapter');
    },
  };
}

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const raw = await sharp(png).ensureAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return raw[3]!; // RGBA
}

describe('§7 OpenAI adapter — mask inversion', () => {
  it('makes edit(white) transparent and keep(black) opaque', async () => {
    // left half white (edit), right half black (keep)
    const mask = await sharp({ create: { width: 4, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer(), left: 0, top: 0 }])
      .png().toBuffer();
    const alpha = await toOpenAIAlphaMask(mask);
    expect(await alphaAt(alpha, 0, 0)).toBe(0); // edit → transparent
    expect(await alphaAt(alpha, 3, 0)).toBe(255); // keep → opaque
  });
});

describe('§7 OpenAI adapter — submit (mock fetch)', () => {
  it('posts a multipart edit request and returns provider-native candidate bytes', async () => {
    const store = memStore();
    const srcKey = await store.store(await solid(64, 64, { r: 10, g: 20, b: 30 }), 'crop');
    const maskKey = await store.store(await solid(64, 64, { r: 255, g: 255, b: 255 }), 'mask');
    const ctx = makeExecutionContext(store);

    let seenUrl = '';
    let seenAuth = '';
    let seenModel: FormDataEntryValue | null = null;
    let seenN: FormDataEntryValue | null = null;
    let hadImage = false;
    let hadMask = false;

    const candidate = (await solid(64, 64, { r: 0, g: 200, b: 0 })).toString('base64');
    const fetchImpl = (async (url: any, init: any) => {
      seenUrl = String(url);
      seenAuth = init.headers.Authorization;
      const form = init.body as FormData;
      seenModel = form.get('model');
      seenN = form.get('n');
      hadImage = form.get('image') != null;
      hadMask = form.get('mask') != null;
      return new Response(JSON.stringify({
        data: [{ b64_json: candidate }, { b64_json: candidate }],
        usage: { input_tokens: 100, output_tokens: 1000, input_tokens_details: { text_tokens: 20, image_tokens: 80 } },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const adapter = makeOpenAIImageInpaintAdapter({ fetchImpl });
    const req: GenRequest = {
      capability: 'image.inpaint', prompt: 'repair the hand', width: 64, height: 64,
      sourceImageKey: srcKey, maskKey, extra: { candidateCount: 2 },
    };
    const out = await adapter.submit('sk-test-KEY', req, ctx);
    const result = 'immediate' in out ? out.immediate : (out as any);

    expect(seenUrl).toBe('https://api.openai.com/v1/images/edits');
    expect(seenAuth).toBe('Bearer sk-test-KEY');
    expect(seenModel).toBe('gpt-image-1');
    expect(seenN).toBe('2');
    expect(hadImage).toBe(true);
    expect(hadMask).toBe(true);
    // native outputs — raw bytes, NOT stored keys (registry stores them)
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0].kind).toBe('bytes');
    expect(result.outputs[0].mimeType).toBe('image/png');
    expect((await sharp(result.outputs[0].bytes).metadata()).width).toBe(64);
    // OpenAI returns no exact cost → reportedCostCents unset; raw usage carried through
    expect(result.reportedCostCents).toBeUndefined();
    expect(result.usage).toBeDefined();
  });

  it('maps a 429 to PROVIDER_RATE_LIMIT and 400 to PROVIDER_REJECTED', async () => {
    const store = memStore();
    const srcKey = await store.store(await solid(8, 8, { r: 0, g: 0, b: 0 }), 'crop');
    const maskKey = await store.store(await solid(8, 8, { r: 255, g: 255, b: 255 }), 'mask');
    const ctx = makeExecutionContext(store);
    const req: GenRequest = { capability: 'image.inpaint', prompt: 'x', width: 8, height: 8, sourceImageKey: srcKey, maskKey, extra: { candidateCount: 1 } };

    const make = (status: number) => makeOpenAIImageInpaintAdapter({
      fetchImpl: (async () => new Response('{"error":{"message":"nope"}}', { status })) as unknown as typeof fetch,
    });
    await expect(make(429).submit('k', req, ctx)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT' });
    await expect(make(400).submit('k', req, ctx)).rejects.toMatchObject({ code: 'PROVIDER_REJECTED' });
  });

  it('throws INTERNAL when no execution context is supplied', async () => {
    const adapter = makeOpenAIImageInpaintAdapter({ fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch });
    const req: GenRequest = { capability: 'image.inpaint', prompt: 'x', width: 8, height: 8, sourceImageKey: 'a', maskKey: 'b' };
    await expect(adapter.submit('k', req)).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('§7 OpenAI adapter — cost estimate', () => {
  it('is 0 when usage is missing and positive when present', () => {
    expect(estimateOpenAIImageCents(undefined)).toBe(0);
    expect(estimateOpenAIImageCents({ input_tokens: 100, output_tokens: 1000, input_tokens_details: { text_tokens: 20, image_tokens: 80 } })).toBeGreaterThan(0);
  });
});
