/**
 * VHE-2 §7 — Provider Execution Context (versioned) + provider-output normalization.
 *
 * OWNER RULING 2026-07-21 (Eli Q2a, recorded in VHE-ISSUE-LOG-0022 append + 0024): the
 * `0022` "storage factory-closure workaround" (adapters/storage-seam.ts, where each real
 * adapter closed over a `ProviderStorage` to both read inputs AND persist outputs) is
 * REPLACED by this versioned execution context. The split of responsibility is now explicit:
 *
 *   • ADAPTERS get a `ProviderExecutionContext` and may ONLY read input bytes
 *     (`readInput`) or request a short-lived signed input URL (`signInputUrl`) for
 *     providers that fetch inputs by URL. Adapters return PROVIDER-NATIVE outputs
 *     (raw bytes or provider URLs) as a `ProviderNativeResult` — they do NOT persist
 *     anything and do NOT invent asset keys.
 *   • The WORKER/REGISTRY owns the output side: download (if the provider returned a URL),
 *     validate against the request contract, deterministically (content-addressed) store,
 *     and convert to `assetKeys` (→ the normalized `GenResult`). See `normalizeToAssetKeys`.
 *
 * This is the owner-authorized §7 interface change (the frozen surface was extended, not
 * broken — see types.ts). The context carries an explicit `version` so the contract can
 * evolve without silently changing adapter behavior.
 */

import { createHash } from 'node:crypto';
import type { GenRequest, GenResult } from './types.ts';
import { ApiError } from '../jobs/errors.ts';

/** The current execution-context contract version. Bump on any breaking change. */
export const PROVIDER_CONTEXT_VERSION = 1 as const;

/**
 * Backing asset store the WORKER supplies. This is the real I/O seam (presigned S3 in
 * production; a local file store in the validation harness). It is NOT handed to adapters
 * directly — the registry wraps its input-only surface into a `ProviderExecutionContext`
 * and keeps `store`/`fetchUrl` (the output side) to itself.
 */
export interface AssetStore {
  /** Resolve a storage key (or an http(s) URL key) to bytes. */
  load(key: string): Promise<Buffer>;
  /** Mint a short-lived signed URL for an INPUT key, for providers that fetch by URL. */
  signUrl(key: string, ttlSec: number): Promise<string>;
  /**
   * Deterministically persist bytes and return an assetKey. Implementations SHOULD be
   * content-addressed so identical bytes yield the same key (idempotent re-runs).
   */
  store(bytes: Buffer, hint: string): Promise<string>;
  /** Download a provider-returned http(s) URL to bytes (short-lived; output side). */
  fetchUrl(url: string): Promise<Buffer>;
}

/**
 * What an adapter is given. Versioned. Input-only: an adapter can read the source/mask/init
 * bytes referenced by the `GenRequest`, or request a short-lived signed URL for them, and
 * nothing else. It cannot persist, cannot mint asset keys, cannot see the output store.
 */
export interface ProviderExecutionContext {
  readonly version: typeof PROVIDER_CONTEXT_VERSION;
  /** Read an input asset's bytes by storage key. */
  readInput(key: string): Promise<Buffer>;
  /** Request a short-lived signed URL for an input key (default TTL 300s). */
  signInputUrl(key: string, opts?: { ttlSec?: number }): Promise<string>;
}

/** One provider-native output: raw bytes OR a provider URL. Exactly one is set. */
export interface ProviderNativeOutput {
  kind: 'bytes' | 'url';
  bytes?: Buffer;
  url?: string;
  /** e.g. 'image/png', 'video/mp4'. Best-effort; validated/sniffed on the worker side. */
  mimeType?: string;
}

/**
 * Raw provider usage as reported (tokens, pixels, seconds, …). Passed straight through to
 * the pricing catalog (cost-catalog.ts); shape is provider-specific, kept as opaque data.
 */
export type ProviderUsage = Record<string, unknown>;

/**
 * What an adapter RETURNS (the new native contract). No asset keys — the registry converts
 * these to keys. `reportedCostCents` is set ONLY when the provider returns an exact,
 * authoritative per-call cost; otherwise it is undefined and the catalog estimates.
 */
export interface ProviderNativeResult {
  outputs: ProviderNativeOutput[];
  seedUsed?: number;
  providerJobId?: string;
  /** The model actually used — keys the pricing catalog (cost-catalog.ts). */
  model?: string;
  usage?: ProviderUsage;
  reportedCostCents?: number;
  raw?: unknown;
}

/** Build the input-only context an adapter sees from a full worker-side store. */
export function makeExecutionContext(store: AssetStore): ProviderExecutionContext {
  return {
    version: PROVIDER_CONTEXT_VERSION,
    readInput: (key) => store.load(key),
    signInputUrl: (key, opts) => store.signUrl(key, opts?.ttlSec ?? 300),
  };
}

/** Discriminate the two success shapes an adapter may hand back. */
export function isNativeResult(r: GenResult | ProviderNativeResult): r is ProviderNativeResult {
  return Array.isArray((r as ProviderNativeResult).outputs);
}

/**
 * Expectations the registry validates provider outputs against, derived from the request.
 * Kept small and explicit; §9.2A reuses this same validator for per-frame patch outputs.
 */
export interface OutputContract {
  /** Minimum number of outputs that must come back (e.g. requested candidate count). */
  minOutputs?: number;
  /** Reject empty/zero-byte payloads. Default true. */
  rejectEmpty?: boolean;
  /** Allowed leading MIME family, e.g. 'image' or 'video'. Omit to allow any. */
  expectMimePrefix?: string;
}

/**
 * Validate a set of provider-native outputs against the request contract. Throws a §4.3
 * `PROVIDER_REJECTED` ApiError on violation (an honest terminal error, not a silent drop).
 * Returns the validated outputs unchanged on success.
 */
export function validateProviderOutputs(
  outputs: ProviderNativeOutput[],
  contract: OutputContract = {},
): ProviderNativeOutput[] {
  const rejectEmpty = contract.rejectEmpty ?? true;
  if (!Array.isArray(outputs)) {
    throw new ApiError('PROVIDER_REJECTED', 422, 'adapter returned no outputs array');
  }
  if (contract.minOutputs !== undefined && outputs.length < contract.minOutputs) {
    throw new ApiError(
      'PROVIDER_REJECTED',
      422,
      `adapter returned ${outputs.length} output(s), expected at least ${contract.minOutputs}`,
    );
  }
  for (const [i, o] of outputs.entries()) {
    const hasBytes = o.kind === 'bytes' && o.bytes !== undefined;
    const hasUrl = o.kind === 'url' && typeof o.url === 'string' && o.url.length > 0;
    if (!hasBytes && !hasUrl) {
      throw new ApiError('PROVIDER_REJECTED', 422, `output[${i}] has neither bytes nor a url`);
    }
    if (rejectEmpty && o.kind === 'bytes' && (o.bytes as Buffer).length === 0) {
      throw new ApiError('PROVIDER_REJECTED', 422, `output[${i}] is zero bytes`);
    }
    if (contract.expectMimePrefix && o.mimeType && !o.mimeType.startsWith(contract.expectMimePrefix)) {
      throw new ApiError(
        'PROVIDER_REJECTED',
        422,
        `output[${i}] mime '${o.mimeType}' is not '${contract.expectMimePrefix}/*'`,
      );
    }
  }
  return outputs;
}

/** Deterministic content-addressed hint suffix so identical bytes → identical store hint. */
function contentTag(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

/**
 * Convert an adapter's provider-native result into a normalized `GenResult` with resolvable
 * `assetKeys`. This is the WORKER/REGISTRY-owned output side (Eli Q2a): for each output,
 * download the URL if needed (short-lived), validate the contract, then deterministically
 * store the bytes (content-addressed hint) and collect the returned assetKey. Order is
 * preserved so candidate N in → candidate N out.
 */
export async function normalizeToAssetKeys(
  native: ProviderNativeResult,
  store: AssetStore,
  opts: { hint?: string; contract?: OutputContract } = {},
): Promise<GenResult> {
  validateProviderOutputs(native.outputs, opts.contract);
  const hint = opts.hint ?? 'provider-output';
  const assetKeys: string[] = [];
  for (const o of native.outputs) {
    const bytes = o.kind === 'url' ? await store.fetchUrl(o.url as string) : (o.bytes as Buffer);
    if ((opts.contract?.rejectEmpty ?? true) && bytes.length === 0) {
      throw new ApiError('PROVIDER_REJECTED', 422, 'downloaded provider output is zero bytes');
    }
    assetKeys.push(await store.store(bytes, `${hint}-${contentTag(bytes)}`));
  }
  if (assetKeys.length === 0) {
    throw new ApiError('PROVIDER_REJECTED', 422, 'no asset keys produced from provider outputs');
  }
  return {
    assetKeys,
    seedUsed: native.seedUsed,
    providerJobId: native.providerJobId,
    costCents: native.reportedCostCents, // only set when the provider gave an exact cost
    raw: native.raw ?? { usage: native.usage },
  };
}
