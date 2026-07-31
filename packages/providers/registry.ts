/**
 * VHE-2 §7 — adapter registry + the generation orchestration that walks a routed chain.
 *
 * Adapters register by slug. `runGeneration` is the single call that §9's repair
 * pipelines will use: it loads the owner's connections, routes them into a chain
 * (routing.ts), and walks the chain (routing.walkChain) — for each connection it
 * decrypts the key at the last moment (crypto.ts / connections.ts), submits, and polls
 * to a terminal state. First success wins; each failure is recorded and it falls
 * through; an exhausted or empty chain throws NO_PROVIDER before returning.
 *
 * §7 exit gate is satisfied by this file plus two mock adapters (see providers.test.ts):
 * first always fails, the job routes, falls through, succeeds on the second, and the
 * winning connection id + cost are returned for the job row.
 *
 * ElevenLabs is intentionally never registered here — it is audio-only and belongs to
 * the VHE-4 layer (VHE-ISSUE-LOG-0018, Ruling 1).
 */

import type { GenResult, ProviderAdapter, GenRequest, AdapterSuccess } from './types.ts';
import type { ProviderConnection, StepResult } from './routing.ts';
import { routeChain, walkChain } from './routing.ts';
import { estimateCostCentsFromChainHead } from './cost.ts';
import { loadConnections, decryptConnectionKey } from './connections.ts';
import { ApiError, classifyError } from '../jobs/errors.ts';
import {
  makeExecutionContext,
  isNativeResult,
  normalizeToAssetKeys,
  type AssetStore,
  type ProviderExecutionContext,
  type OutputContract,
} from './execution-context.ts';
import { buildCostRecord, costCentsOf, type CostRecord } from './cost-catalog.ts';

const adapters = new Map<string, ProviderAdapter>();

export function registerAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.slug, adapter);
}
export function getAdapter(slug: string): ProviderAdapter | undefined {
  return adapters.get(slug);
}
export function clearAdapters(): void {
  adapters.clear();
}

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

export interface RunGenerationOpts {
  /** Injectable DB query (tests); defaults to the shared pool. */
  query?: QueryFn;
  /** Pre-resolved connections (tests); defaults to loadConnections(ownerId). */
  connections?: ProviderConnection[];
  /** Poll cadence + ceiling for adapters that don't return an immediate result. */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** Injectable sleep so tests don't wait on wall-clock. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Worker-supplied asset store (Eli Q2a). Required for adapters that return provider-NATIVE
   * outputs (bytes/URLs): the registry uses it to download, validate, deterministically store,
   * and mint assetKeys. Legacy adapters that return a `GenResult` with assetKeys directly (the
   * mock adapters, §7 exit gate) do not need it. An adapter may also use the input-only context
   * derived from this store to read source/mask bytes or request short-lived signed input URLs.
   */
  store?: AssetStore;
  /** Contract the registry validates provider-native outputs against (e.g. min candidate count). */
  outputContract?: OutputContract;
}

export interface RunGenerationResult {
  connectionId: string; // → jobs.provider_id
  providerSlug: string;
  result: GenResult;
  costCents: number; // → jobs.cost_cents (reported if the provider returned an exact cost, else estimate)
  /** Full cost record (Eli Q2c): raw usage + estimate + reported + provenance + billing authority. */
  cost: CostRecord;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll one submitted provider job to a terminal state, or throw on timeout. */
async function pollToTerminal(
  adapter: ProviderAdapter,
  key: string,
  providerJobId: string,
  opts: RunGenerationOpts,
  ctx: ProviderExecutionContext | undefined,
): Promise<AdapterSuccess> {
  const intervalMs = opts.pollIntervalMs ?? 2000;
  const timeoutMs = opts.pollTimeoutMs ?? 180_000;
  const sleep = opts.sleep ?? defaultSleep;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const p = await adapter.poll(key, providerJobId, ctx);
    if (p.status === 'succeeded') return p.result;
    if (p.status === 'failed') throw new ApiError('PROVIDER_REJECTED', 422, p.error);
    if (Date.now() >= deadline) throw new ApiError('PROVIDER_TIMEOUT', 504, 'provider poll exceeded deadline');
    await sleep(intervalMs);
  }
}

/**
 * Turn whatever the adapter handed back into (a) a `GenResult` with resolvable assetKeys and
 * (b) a `CostRecord` (Eli Q2a + Q2c).
 *   • Native adapters return `ProviderNativeResult` — the registry (NOT the adapter) downloads/
 *     validates/stores the outputs (needs a worker-supplied `store`) and builds the cost record
 *     from the native `model`/`usage`/`reportedCostCents`.
 *   • Legacy adapters already return a `GenResult`; its `costCents` is treated as a
 *     provider-reported figure.
 */
async function finalizeSuccess(
  raw: AdapterSuccess,
  slug: string,
  opts: RunGenerationOpts,
): Promise<{ result: GenResult; cost: CostRecord }> {
  if (isNativeResult(raw)) {
    if (!opts.store) {
      throw new ApiError(
        'INTERNAL',
        500,
        `adapter '${slug}' returned provider-native outputs but no asset store was supplied ` +
          `to runGeneration (opts.store) to download/validate/persist them`,
      );
    }
    const stored = await normalizeToAssetKeys(raw, opts.store, {
      hint: `${slug}-output`,
      contract: opts.outputContract,
    });
    const cost = buildCostRecord({
      providerSlug: slug,
      model: raw.model,
      usage: raw.usage,
      reportedCents: raw.reportedCostCents,
    });
    return { result: { ...stored, costCents: costCentsOf(cost) }, cost };
  }
  const cost = buildCostRecord({ providerSlug: slug, reportedCents: raw.costCents });
  return { result: raw, cost };
}

/**
 * Route + walk the chain for one request. Returns the winning connection and cost, or
 * throws NO_PROVIDER (empty/exhausted chain — before any further spend).
 */
export async function runGeneration(
  ownerId: string,
  req: GenRequest,
  opts: RunGenerationOpts = {},
): Promise<RunGenerationResult> {
  const connections = opts.connections ?? (await loadConnections(ownerId, opts.query));
  const chain = routeChain(req, connections);
  // Input-only, versioned context handed to adapters (Eli Q2a). Undefined when no store is
  // supplied — legacy/mock adapters that resolve nothing external simply ignore the arg.
  const ctx = opts.store ? makeExecutionContext(opts.store) : undefined;

  // The cost record of the WINNING attempt. walkChain returns on the first ok attempt, and each
  // attempt sets this immediately before returning ok, so it always reflects the winner.
  let winningCost: CostRecord | undefined;

  const attempt = async (conn: ProviderConnection): Promise<StepResult> => {
    const adapter = getAdapter(conn.providerSlug);
    if (!adapter) {
      return { ok: false, errorCode: 'NO_PROVIDER', error: `no adapter registered for slug '${conn.providerSlug}'` };
    }
    // Plaintext key exists only for the duration of this attempt (§7 security rule).
    const key = await decryptConnectionKey(ownerId, conn.id, opts.query);
    try {
      const submitted = await adapter.submit(key, req, ctx);
      const raw =
        'immediate' in submitted
          ? submitted.immediate
          : await pollToTerminal(adapter, key, submitted.providerJobId, opts, ctx);
      const { result, cost } = await finalizeSuccess(raw, conn.providerSlug, opts);
      winningCost = cost;
      return { ok: true, result };
    } catch (err) {
      const { code } = classifyError(err);
      return { ok: false, errorCode: code, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const outcome = await walkChain(chain, attempt);
  let cost = winningCost!; // set by the winning attempt (walkChain returned on its ok)
  // When neither the provider nor the per-model catalog produced a figure, fall back to the §7
  // per-capability chain-head estimate so the operational number is never worse than before —
  // and record that provenance on the audit artifact so estimate and billed number never diverge.
  if (cost.reportedCents === null && cost.estimatedCents === 0) {
    const fallback = estimateCostCentsFromChainHead([outcome.connection], req);
    cost = {
      ...cost,
      estimatedCents: fallback,
      provenance: {
        source: cost.provenance.source,
        asOf: cost.provenance.asOf,
        note: `${cost.provenance.note ?? ''} [estimate = §7 per-capability chain-head default; no per-model catalog entry]`.trim(),
      },
    };
  }
  return {
    connectionId: outcome.connection.id,
    providerSlug: outcome.connection.providerSlug,
    result: outcome.result,
    costCents: costCentsOf(cost),
    cost,
  };
}
