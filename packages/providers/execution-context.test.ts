/**
 * VHE-2 §7 — Provider Execution Context + provider-output normalization (Eli Q2a).
 *
 * Covers the WORKER/REGISTRY-owned output side that replaced the `0022` storage
 * factory-closure: input-only context wiring, output-contract validation, and the
 * download→validate→deterministically-store→assetKey conversion.
 */

import { describe, expect, it } from 'vitest';
import {
  makeExecutionContext,
  normalizeToAssetKeys,
  validateProviderOutputs,
  isNativeResult,
  PROVIDER_CONTEXT_VERSION,
  type AssetStore,
  type ProviderNativeResult,
} from './execution-context.ts';

/** In-memory AssetStore that records what it was asked to do. */
function memStore(): AssetStore & { stored: { key: string; bytes: Buffer }[]; signed: string[]; fetched: string[] } {
  const map = new Map<string, Buffer>();
  const stored: { key: string; bytes: Buffer }[] = [];
  const signed: string[] = [];
  const fetched: string[] = [];
  let n = 0;
  return {
    stored, signed, fetched,
    async load(key) { const b = map.get(key); if (!b) throw new Error(`no key ${key}`); return b; },
    async store(bytes, hint) { const k = `mem/${hint}/${n++}`; map.set(k, bytes); stored.push({ key: k, bytes }); return k; },
    async signUrl(key, ttlSec) { signed.push(`${key}?ttl=${ttlSec}`); return `https://signed/${key}?ttl=${ttlSec}`; },
    async fetchUrl(url) { fetched.push(url); return Buffer.from(`bytes-of:${url}`); },
  };
}

describe('§7 execution context — input-only, versioned', () => {
  it('exposes version and delegates readInput/signInputUrl to the store', async () => {
    const store = memStore();
    const seededKey = await store.store(Buffer.from('hello'), 'seed');
    const ctx = makeExecutionContext(store);
    expect(ctx.version).toBe(PROVIDER_CONTEXT_VERSION);
    expect((await ctx.readInput(seededKey)).toString()).toBe('hello');
    const url = await ctx.signInputUrl('media/x.png');
    expect(url).toContain('media/x.png');
    expect(store.signed[0]).toBe('media/x.png?ttl=300'); // default TTL
    await ctx.signInputUrl('media/y.png', { ttlSec: 60 });
    expect(store.signed[1]).toBe('media/y.png?ttl=60');
  });
});

describe('§7 validateProviderOutputs — the output contract', () => {
  it('accepts valid bytes and url outputs', () => {
    const outs = validateProviderOutputs([
      { kind: 'bytes', bytes: Buffer.from('x'), mimeType: 'image/png' },
      { kind: 'url', url: 'https://p/1.png', mimeType: 'image/png' },
    ], { minOutputs: 2, expectMimePrefix: 'image' });
    expect(outs).toHaveLength(2);
  });

  it('rejects too few outputs', () => {
    expect(() => validateProviderOutputs([{ kind: 'bytes', bytes: Buffer.from('x') }], { minOutputs: 2 }))
      .toThrow(/expected at least 2/);
  });

  it('rejects an output with neither bytes nor url', () => {
    expect(() => validateProviderOutputs([{ kind: 'bytes' } as any])).toThrow(/neither bytes nor a url/);
  });

  it('rejects zero-byte bytes when rejectEmpty', () => {
    expect(() => validateProviderOutputs([{ kind: 'bytes', bytes: Buffer.alloc(0) }])).toThrow(/zero bytes/);
  });

  it('rejects a mime that is not the expected family', () => {
    expect(() => validateProviderOutputs([{ kind: 'bytes', bytes: Buffer.from('x'), mimeType: 'video/mp4' }], { expectMimePrefix: 'image' }))
      .toThrow(/not 'image\/\*'/);
  });
});

describe('§7 normalizeToAssetKeys — worker-owned persistence', () => {
  it('stores each bytes output in order and returns assetKeys', async () => {
    const store = memStore();
    const native: ProviderNativeResult = {
      outputs: [
        { kind: 'bytes', bytes: Buffer.from('cand-A'), mimeType: 'image/png' },
        { kind: 'bytes', bytes: Buffer.from('cand-B'), mimeType: 'image/png' },
      ],
      usage: { candidatesTokenCount: 100 },
    };
    const gen = await normalizeToAssetKeys(native, store, { hint: 'openai-output' });
    expect(gen.assetKeys).toHaveLength(2);
    expect(store.stored.map((s) => s.bytes.toString())).toEqual(['cand-A', 'cand-B']); // order preserved
    // no exact provider cost → costCents stays undefined; raw carries the usage
    expect(gen.costCents).toBeUndefined();
    expect(gen.raw).toEqual({ usage: { candidatesTokenCount: 100 } });
  });

  it('is content-addressed: identical bytes produce an identical store hint', async () => {
    const store = memStore();
    const same = Buffer.from('identical-bytes');
    await normalizeToAssetKeys({ outputs: [{ kind: 'bytes', bytes: same }, { kind: 'bytes', bytes: same }] }, store, { hint: 'h' });
    // both hints share the same sha256[:16] suffix
    const suffixes = store.stored.map((s) => s.key.split('/')[1].replace(/^h-/, ''));
    expect(suffixes[0]).toBe(suffixes[1]);
  });

  it('downloads url outputs via the store before persisting', async () => {
    const store = memStore();
    const gen = await normalizeToAssetKeys(
      { outputs: [{ kind: 'url', url: 'https://p/out.png', mimeType: 'image/png' }] },
      store,
    );
    expect(store.fetched).toEqual(['https://p/out.png']);
    expect(gen.assetKeys).toHaveLength(1);
    expect(store.stored[0].bytes.toString()).toBe('bytes-of:https://p/out.png');
  });

  it('carries an exact provider cost through to costCents when present', async () => {
    const store = memStore();
    const gen = await normalizeToAssetKeys(
      { outputs: [{ kind: 'bytes', bytes: Buffer.from('x') }], reportedCostCents: 42, seedUsed: 7, providerJobId: 'pj-1' },
      store,
    );
    expect(gen.costCents).toBe(42);
    expect(gen.seedUsed).toBe(7);
    expect(gen.providerJobId).toBe('pj-1');
  });

  it('enforces the contract (min candidate count) during normalization', async () => {
    const store = memStore();
    await expect(
      normalizeToAssetKeys({ outputs: [{ kind: 'bytes', bytes: Buffer.from('x') }] }, store, { contract: { minOutputs: 2 } }),
    ).rejects.toMatchObject({ code: 'PROVIDER_REJECTED' });
  });
});

describe('§7 isNativeResult', () => {
  it('distinguishes native results from legacy GenResults', () => {
    expect(isNativeResult({ outputs: [] } as any)).toBe(true);
    expect(isNativeResult({ assetKeys: ['a'] } as any)).toBe(false);
  });
});
