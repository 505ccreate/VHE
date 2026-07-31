/**
 * VHE-2 §7 — cost estimation.
 *
 * §7 verbatim: "estimateCostCents(type, input) reads costHintCentsPerOp from the chosen
 * chain's head; unknown → conservative per-capability defaults (config table, not code).
 * The §4 budget gate uses this estimate; actual cost_cents is written from the adapter
 * result."
 *
 * Two entry points, because "the chosen chain's head" and the §4 budget gate exist at
 * DIFFERENT moments (flagged in VHE-ISSUE-LOG-0018):
 *
 *   1. `estimateCostCents(type, input)` — SYNC, the exact shape createJob's
 *      `deps.estimateCostCents` seam expects (packages/jobs/create.ts). It runs at CLAIM
 *      time, BEFORE routing, so there is no chosen chain yet and it cannot know which
 *      provider will win (the chain can fall through). It therefore returns the
 *      conservative per-capability DEFAULT — which is exactly §7's "unknown → defaults"
 *      branch, and the only honest pre-spend gate. Dropping this into createJob needs no
 *      §4 change (CURRENT-STATUS / VHE-ISSUE-LOG-0017).
 *
 *   2. `estimateCostCentsFromChainHead(chain, req)` — the §7 "reads from chain head"
 *      form, usable AFTER routing when a chain exists. Reads the head connection's
 *      costHintCentsPerOp for the capability; unknown → the same conservative default.
 *
 * The authoritative cost is never either estimate: §7 says actual `cost_cents` is written
 * from the adapter's GenResult.
 */

import type { JobType } from '../jobs/create.ts';
import type { Capability, GenRequest } from './types.ts';
import type { ProviderConnection } from './routing.ts';
import { defaultCostCents } from './cost-defaults.ts';

/**
 * Which JobTypes actually spend at a §7 provider, and their base capability. Types not
 * listed are local work (FFmpeg ingest/stitch/export, the SAM mask track) — zero
 * provider spend at claim time. `input.capability`, when present and valid, refines the
 * base (e.g. an image job doing i2i vs inpaint).
 */
const JOB_TYPE_BASE_CAPABILITY: Partial<Record<JobType, Capability>> = {
  'generate.image': 'image.t2i',
  'inpaint.image': 'image.inpaint',
  'repair.range': 'video.inpaint',
  'generate.segment': 'video.t2v',
};

const ALL_CAPABILITIES: readonly Capability[] = [
  'image.t2i', 'image.i2i', 'image.inpaint', 'image.inpaint.identity_ref', 'image.upscale',
  'video.t2v', 'video.i2v', 'video.inpaint', 'video.extend',
];

function capabilityForClaim(type: JobType, input: unknown): Capability | null {
  const explicit =
    input && typeof input === 'object' && 'capability' in input
      ? (input as { capability?: unknown }).capability
      : undefined;
  if (typeof explicit === 'string' && ALL_CAPABILITIES.includes(explicit as Capability)) {
    return explicit as Capability;
  }
  return JOB_TYPE_BASE_CAPABILITY[type] ?? null;
}

/**
 * SYNC pre-spend estimate for createJob's budget gate. Non-provider job types (ingest,
 * stitch, export, mask track) cost 0. Provider types return the conservative default for
 * their capability.
 */
export function estimateCostCents(type: JobType, input: unknown): number {
  const capability = capabilityForClaim(type, input);
  return capability === null ? 0 : defaultCostCents(capability);
}

/**
 * §7 "reads costHintCentsPerOp from the chosen chain's head" — used once routing has
 * produced a chain. Falls back to the conservative per-capability default when the head
 * advertises no hint. Empty chain → the default (the caller will fail NO_PROVIDER anyway).
 */
export function estimateCostCentsFromChainHead(chain: ProviderConnection[], req: GenRequest): number {
  const head = chain[0];
  const hint = head?.manifest.capabilities[req.capability]?.costHintCentsPerOp;
  return hint ?? defaultCostCents(req.capability);
}
