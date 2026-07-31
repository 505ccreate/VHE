/**
 * VHE-2 §7 — capability routing.
 *
 * §7 verbatim "Routing" paragraph:
 *   "filter the owner's connections to those whose manifest satisfies the request
 *    (capability present, dimensions/duration within limits, mask support if maskKey
 *    present), put the owner's is_default_for choice first, and return the ordered
 *    chain. The worker walks the chain; each failure records error_code per connection
 *    and falls through. Empty chain → fail fast with NO_PROVIDER before any spend."
 *
 * The ONE datum §7 did not fix is the tiebreak order among eligible providers that are
 * NOT the owner's default. That is the owner ruling in VHE-ISSUE-LOG-0018:
 *   visual fallback order = fal.ai → Replicate → Google → OpenAI.
 * It is a FALLBACK order only — the owner's is_default_for choice always precedes it,
 * and capability filtering runs first, so a provider without the key/capability is
 * already gone before ordering. ElevenLabs is NOT here: it is audio-only (VHE-4).
 */

import type { Capability, CapabilityManifest, GenRequest, GenResult } from './types.ts';
import { ApiError } from '../jobs/errors.ts';

/**
 * The owner's visual-repair fallback ranking (VHE-ISSUE-LOG-0018, Ruling 1). Slugs not
 * listed here sort AFTER all listed ones, preserving their relative input order.
 */
export const VISUAL_FALLBACK_ORDER: readonly string[] = ['fal', 'replicate', 'google', 'openai'];

/**
 * A resolved provider connection as routing sees it: the manifest (for filtering) plus
 * which capabilities the owner made this connection the default for. The plaintext key
 * is deliberately NOT here — it is decrypted only at execution time (§7 / crypto.ts).
 */
export interface ProviderConnection {
  id: string;
  providerSlug: string;
  manifest: CapabilityManifest;
  isDefaultFor: Capability[];
}

/** Does this connection's manifest satisfy the request? (verbatim §7 filter criteria) */
export function manifestSatisfies(conn: ProviderConnection, req: GenRequest): boolean {
  const cap = conn.manifest.capabilities[req.capability];
  if (!cap) return false; // capability present
  if (req.width > cap.maxWidth || req.height > cap.maxHeight) return false; // dimensions within limits
  if (req.durationSec !== undefined) {
    // duration within limits
    if (cap.minDurationSec !== undefined && req.durationSec < cap.minDurationSec) return false;
    if (cap.maxDurationSec !== undefined && req.durationSec > cap.maxDurationSec) return false;
  }
  if (req.maskKey !== undefined && !cap.supportsMask) return false; // mask support if maskKey present
  return true;
}

/**
 * Build the ordered provider chain for a request:
 *   1. keep only connections whose manifest satisfies the request;
 *   2. connections the owner marked is_default_for THIS capability go first;
 *   3. the rest sort by the VISUAL_FALLBACK_ORDER ranking (unranked slugs last, stable).
 * An empty result is legal — the caller fails fast with NO_PROVIDER before any spend.
 */
export function routeChain(
  req: GenRequest,
  connections: ProviderConnection[],
  fallbackOrder: readonly string[] = VISUAL_FALLBACK_ORDER,
): ProviderConnection[] {
  const eligible = connections.filter((c) => manifestSatisfies(c, req));

  const rank = (slug: string): number => {
    const i = fallbackOrder.indexOf(slug);
    return i === -1 ? fallbackOrder.length : i;
  };

  // Decorate-sort-undecorate to keep it stable and total-ordered.
  return eligible
    .map((conn, idx) => ({
      conn,
      idx,
      isDefault: conn.isDefaultFor.includes(req.capability),
      rank: rank(conn.providerSlug),
    }))
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1; // owner default first
      if (a.rank !== b.rank) return a.rank - b.rank; // then fallback ranking
      return a.idx - b.idx; // stable on input order
    })
    .map((d) => d.conn);
}

/** Outcome of trying one connection while walking the chain. */
export type StepResult =
  | { ok: true; result: GenResult }
  | { ok: false; errorCode: string; error: string };

/** A per-connection failure recorded while walking (§7: "records error_code per connection"). */
export interface ChainFailure {
  connectionId: string;
  providerSlug: string;
  errorCode: string;
  error: string;
}

export interface WalkOutcome {
  connection: ProviderConnection;
  result: GenResult;
  failures: ChainFailure[]; // the connections that failed before this one succeeded
}

/**
 * Walk the ordered chain: try each connection in turn; on failure record its error_code
 * and fall through to the next; return the first success. An empty chain (or a chain
 * where every connection fails) throws NO_PROVIDER — §7's "fail fast … before any spend"
 * for the empty case, and the exhausted case surfaces the same terminal code with the
 * per-connection failure trail attached for the job row.
 */
export async function walkChain(
  chain: ProviderConnection[],
  attempt: (conn: ProviderConnection) => Promise<StepResult>,
): Promise<WalkOutcome> {
  const failures: ChainFailure[] = [];
  for (const connection of chain) {
    const step = await attempt(connection);
    if (step.ok) return { connection, result: step.result, failures };
    failures.push({
      connectionId: connection.id,
      providerSlug: connection.providerSlug,
      errorCode: step.errorCode,
      error: step.error,
    });
  }
  const detail =
    failures.length === 0
      ? 'no eligible provider connection for this capability'
      : `all ${failures.length} eligible provider(s) failed: ` +
        failures.map((f) => `${f.providerSlug}=${f.errorCode}`).join(', ');
  throw new ApiError('NO_PROVIDER', 422, detail);
}
