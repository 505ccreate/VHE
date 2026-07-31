/**
 * VHE-2 §7 — HYBRID capability-manifest cache seam.
 *
 * OWNER RULING 2026-07-21 (Eli Q3, recorded in VHE-ISSUE-LOG-0023 append + 0024): the `0022`
 * adapters use HARDCODED manifests. Move toward LIVE-hydrated manifests — the pattern VHE-4
 * already uses for its voice catalog ("live, 24h TTL") — but do it as a SEAM now, without
 * pausing §9.2 to retrofit every image adapter. When the generation layer begins, OpenRouter's
 * live `/api/v1/videos/models` endpoint hydrates the video manifest through this same seam.
 *
 * "Hybrid" = three sources coexist behind one read path:
 *   • LIVE     — fetched from the provider's discovery endpoint (adapter.describeCapabilities).
 *   • SNAPSHOT — a manually pinned manifest, for providers with NO discovery endpoint. Never
 *                expires on TTL (there is nothing live to refresh it from).
 *   • LAST-KNOWN-GOOD — a previously-live manifest served (marked stale) when a refresh fails,
 *                so a transient discovery outage never drops a working provider.
 *
 * Refresh policy: on connect (forced) and after a 24h TTL. The backing `ManifestStore` is
 * pluggable (in-memory here; a DB/`provider_connections.capabilities` column later) so this seam
 * does not touch the frozen §2 schema now.
 */

import type { CapabilityManifest } from './types.ts';

/** Bump when the cached-entry shape changes. */
export const MANIFEST_CACHE_VERSION = 1 as const;

/** Default refresh TTL: 24h (matches VHE-4's live voice-catalog TTL). */
export const DEFAULT_MANIFEST_TTL_MS = 24 * 60 * 60 * 1000;

export type ManifestSource = 'live' | 'snapshot' | 'last-known-good';

export interface CachedManifest {
  version: typeof MANIFEST_CACHE_VERSION;
  manifest: CapabilityManifest;
  /** Epoch ms the manifest was fetched/pinned. */
  fetchedAt: number;
  source: ManifestSource;
  /** True when this was served past its TTL because a live refresh failed. */
  stale: boolean;
}

/** Pluggable backing store. In-memory now; a DB-backed impl slots in unchanged later. */
export interface ManifestStore {
  get(key: string): Promise<CachedManifest | undefined>;
  set(key: string, entry: CachedManifest): Promise<void>;
}

/** In-memory ManifestStore (tests, single-process dev). */
export function inMemoryManifestStore(): ManifestStore {
  const map = new Map<string, CachedManifest>();
  return {
    async get(key) { return map.get(key); },
    async set(key, entry) { map.set(key, entry); },
  };
}

/** A live discovery fetch — typically `() => adapter.describeCapabilities(key)`. */
export type ManifestFetcher = () => Promise<CapabilityManifest>;

export interface ManifestCacheOpts {
  ttlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface ManifestCache {
  /**
   * Read a manifest. Snapshots are returned as-is (nothing live to refresh). Otherwise: serve a
   * fresh cached entry; if missing or past TTL, fetch live; if the live fetch fails but a prior
   * manifest exists, serve it marked stale (last-known-good); if nothing exists, rethrow.
   */
  get(key: string, fetcher: ManifestFetcher): Promise<CachedManifest>;
  /**
   * Force a live refresh (call this when a connection is created or tested). On failure, fall
   * back to last-known-good if present; otherwise the error propagates (a brand-new connection
   * with an unreachable endpoint and no snapshot legitimately fails).
   */
  refreshOnConnect(key: string, fetcher: ManifestFetcher): Promise<CachedManifest>;
  /** Pin a manual snapshot for a provider without a discovery endpoint. */
  putSnapshot(key: string, manifest: CapabilityManifest): Promise<CachedManifest>;
  /** Peek the cached entry without triggering any fetch. */
  peek(key: string): Promise<CachedManifest | undefined>;
}

export function makeManifestCache(store: ManifestStore, opts: ManifestCacheOpts = {}): ManifestCache {
  const ttlMs = opts.ttlMs ?? DEFAULT_MANIFEST_TTL_MS;
  const now = opts.now ?? (() => Date.now());

  const isFresh = (entry: CachedManifest): boolean =>
    !entry.stale && now() - entry.fetchedAt < ttlMs;

  async function fetchLive(key: string, fetcher: ManifestFetcher): Promise<CachedManifest> {
    const manifest = await fetcher();
    const entry: CachedManifest = { version: MANIFEST_CACHE_VERSION, manifest, fetchedAt: now(), source: 'live', stale: false };
    await store.set(key, entry);
    return entry;
  }

  /** Serve the prior entry as stale last-known-good (keeps its original fetchedAt). */
  async function serveLastKnownGood(key: string, prior: CachedManifest): Promise<CachedManifest> {
    const lkg: CachedManifest = { ...prior, source: 'last-known-good', stale: true };
    await store.set(key, lkg);
    return lkg;
  }

  return {
    async peek(key) {
      return store.get(key);
    },

    async putSnapshot(key, manifest) {
      const entry: CachedManifest = { version: MANIFEST_CACHE_VERSION, manifest, fetchedAt: now(), source: 'snapshot', stale: false };
      await store.set(key, entry);
      return entry;
    },

    async get(key, fetcher) {
      const entry = await store.get(key);
      // Snapshots have no live source to refresh from — return them directly.
      if (entry && entry.source === 'snapshot') return entry;
      // Fresh live/LKG entry — serve without a fetch.
      if (entry && isFresh(entry)) return entry;
      // Missing or stale → try a live refresh; on failure fall back to LKG when we have one.
      try {
        return await fetchLive(key, fetcher);
      } catch (err) {
        if (entry) return serveLastKnownGood(key, entry);
        throw err;
      }
    },

    async refreshOnConnect(key, fetcher) {
      const prior = await store.get(key);
      try {
        return await fetchLive(key, fetcher);
      } catch (err) {
        if (prior) return serveLastKnownGood(key, prior);
        throw err;
      }
    },
  };
}
