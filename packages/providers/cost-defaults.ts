/**
 * VHE-2 §7 — conservative per-capability cost defaults.
 *
 * §7 verbatim: "estimateCostCents(type, input) reads costHintCentsPerOp from the
 * chosen chain's head; unknown → conservative per-capability defaults (config table,
 * not code)."
 *
 * ⚠️ OPEN DECISION (VHE-ISSUE-LOG-0018): §7 says these defaults live in a "config
 * table, not code." The §2 schema is FROZEN and has no config table, and adding one is
 * an architecture change the builder must not make unilaterally. So this file holds the
 * defaults as a DATA module — a plain lookup table, no branching logic — which honors
 * the "editable as configuration, not buried in logic" intent without a schema
 * migration. If the owner wants a DB `config` table, that is a future migration and
 * this module becomes its seed/fallback. Values are deliberately HIGH (conservative):
 * the §4 budget gate must never under-estimate and let spend exceed the cap.
 */

import type { Capability } from './types.ts';

/**
 * Conservative upper-bound cents-per-op per capability. Used ONLY when the routed
 * chain head advertises no costHintCentsPerOp. Chosen high on purpose (see header).
 */
export const DEFAULT_COST_CENTS: Record<Capability, number> = {
  'image.t2i': 10,
  'image.i2i': 10,
  'image.inpaint': 15,
  'image.inpaint.identity_ref': 20,
  'image.upscale': 8,
  'video.t2v': 300,
  'video.i2v': 300,
  'video.inpaint': 400,
  'video.extend': 300,
};

/** Absolute fallback when a capability is somehow absent from the table above. */
export const UNKNOWN_CAPABILITY_COST_CENTS = 500;

export function defaultCostCents(capability: Capability): number {
  return DEFAULT_COST_CENTS[capability] ?? UNKNOWN_CAPABILITY_COST_CENTS;
}
