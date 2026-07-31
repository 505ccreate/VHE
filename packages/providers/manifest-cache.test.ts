/**
 * VHE-2 §7 — hybrid manifest cache seam (Eli Q3).
 *
 * Verifies the three sources (live / snapshot / last-known-good), the 24h TTL refresh,
 * refresh-on-connect, and that a discovery outage never drops a working provider.
 */

import { describe, expect, it, vi } from 'vitest';
import type { CapabilityManifest } from './types.ts';
import {
  DEFAULT_MANIFEST_TTL_MS,
  MANIFEST_CACHE_VERSION,
  inMemoryManifestStore,
  makeManifestCache,
} from './manifest-cache.ts';

function manifest(slug: string, maxWidth = 1024): CapabilityManifest {
  return {
    providerSlug: slug,
    capabilities: { 'image.inpaint': { maxWidth, maxHeight: maxWidth, supportsSeed: false, supportsNegativePrompt: false, supportsMask: true, supportsReferenceImages: 0 } },
  };
}

/** A controllable clock. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('§7 manifest cache — live fetch + TTL', () => {
  it('fetches live on a miss and serves the cached copy within the TTL', async () => {
    const c = clock();
    const cache = makeManifestCache(inMemoryManifestStore(), { now: c.now });
    const fetcher = vi.fn(async () => manifest('fal', 2048));

    const first = await cache.get('conn-fal', fetcher);
    expect(first.source).toBe('live');
    expect(first.version).toBe(MANIFEST_CACHE_VERSION);
    expect(fetcher).toHaveBeenCalledTimes(1);

    c.advance(DEFAULT_MANIFEST_TTL_MS - 1); // still fresh
    const second = await cache.get('conn-fal', fetcher);
    expect(second.source).toBe('live');
    expect(fetcher).toHaveBeenCalledTimes(1); // served from cache, no refetch
  });

  it('refetches after the 24h TTL elapses', async () => {
    const c = clock();
    const cache = makeManifestCache(inMemoryManifestStore(), { now: c.now });
    const fetcher = vi.fn(async () => manifest('fal'));
    await cache.get('k', fetcher);
    c.advance(DEFAULT_MANIFEST_TTL_MS + 1);
    await cache.get('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('§7 manifest cache — last-known-good on discovery failure', () => {
  it('serves the prior manifest marked stale when a refresh fails', async () => {
    const c = clock();
    const cache = makeManifestCache(inMemoryManifestStore(), { now: c.now });
    let live: CapabilityManifest | null = manifest('replicate');
    const fetcher = vi.fn(async () => { if (!live) throw new Error('discovery 503'); return live; });

    await cache.get('k', fetcher); // seed a live entry
    c.advance(DEFAULT_MANIFEST_TTL_MS + 1); // force a refresh
    live = null; // discovery now down
    const served = await cache.get('k', fetcher);
    expect(served.source).toBe('last-known-good');
    expect(served.stale).toBe(true);
    expect(served.manifest.providerSlug).toBe('replicate'); // the working provider survived
  });

  it('propagates the error when there is no prior manifest to fall back to', async () => {
    const cache = makeManifestCache(inMemoryManifestStore());
    await expect(cache.get('cold', async () => { throw new Error('discovery down'); })).rejects.toThrow(/discovery down/);
  });
});

describe('§7 manifest cache — refreshOnConnect', () => {
  it('forces a live fetch even within the TTL', async () => {
    const c = clock();
    const cache = makeManifestCache(inMemoryManifestStore(), { now: c.now });
    const fetcher = vi.fn(async () => manifest('google'));
    await cache.get('k', fetcher); // 1
    await cache.refreshOnConnect('k', fetcher); // 2 — forced despite being fresh
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('falls back to last-known-good when the connect-time refresh fails', async () => {
    const cache = makeManifestCache(inMemoryManifestStore());
    await cache.get('k', async () => manifest('google'));
    const served = await cache.refreshOnConnect('k', async () => { throw new Error('down'); });
    expect(served.source).toBe('last-known-good');
    expect(served.stale).toBe(true);
  });
});

describe('§7 manifest cache — manual snapshots (no discovery endpoint)', () => {
  it('pins a snapshot that never expires and is never refreshed', async () => {
    const c = clock();
    const cache = makeManifestCache(inMemoryManifestStore(), { now: c.now });
    await cache.putSnapshot('conn-openai', manifest('openai'));
    const fetcher = vi.fn(async () => manifest('openai', 9999));

    c.advance(DEFAULT_MANIFEST_TTL_MS * 10); // long past any TTL
    const served = await cache.get('conn-openai', fetcher);
    expect(served.source).toBe('snapshot');
    expect(fetcher).not.toHaveBeenCalled(); // snapshots are authoritative, no live fetch
  });
});
