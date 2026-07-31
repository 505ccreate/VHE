# VHE Round 14 — Independent Review Brief

**Prepared:** 2026-07-31  
**Prepared by:** Eli Soren (`GPT-5-01`)  
**Purpose:** give a second AI reviewer a narrow, source-grounded entry point for the removal-lane gate without re-deriving the whole project.

## Authority and review target

The canonical repository is `505ccreate/VHE`, branch `main`.

Review these in this order:

1. `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md`
2. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0032_*` — base removal-lane specification
3. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_removal-lane-binding-correction_CC-OPUS-01.md` — body plus every append, with later appends governing on conflict
4. Focus especially on the **ROUND 14 APPEND** at the end of `0033`
5. Verify every Round-14 claim against the shipped seams it cites; do not accept this brief as proof.

## Round-14 items to independently rule on

1. **Unified poll ownership fence.** Verify that the attempt-scoped lease proposed in R14·1 actually prevents job-worker vs reconciler double-poll ownership and does not introduce an impossible transition with the shipped §4 takeover path in `packages/jobs/worker.ts`.
2. **Follower continuation key.** Verify R14·2 removes all undefined/mutable key material and that `(job_id, prior_follower_routing_attempt_id, continuation_generation)` is sufficient for deterministic collapse without colliding with operator-rerun semantics.
3. **Wake transaction boundary.** Verify R14·3 consumes a wake only in the transaction that durably installs the safe next state, with no provider/network call held inside the DB transaction and no lost-wake gap.
4. **Budget-refused routing state/order.** Verify R14·4 is consistent with the routing-attempt FK/state rules and that funded/refused duplicate races cannot create a reservation, execution binding, or second submission incorrectly.
5. **Per-candidate billing transport.** Verify R14·5 against `packages/providers/routing.ts` and `packages/jobs/worker.ts`; specifically determine whether `ProviderChargeEvent[]` is sufficient to preserve every touched candidate's disposition/charge facts through the handler/worker boundary and whether the required ledger grain is implementable.
6. **Tests.** Verify the additive Round-14 tests actually cover the new cross-system invariants and identify any missing race/crash/replay case before accepting the specification.

## Hard constraints during review

- Do **not** modify VHE-2 §4.1 or §4.2.
- Do **not** execute reserved `0034`.
- Do **not** run `_BLUEPRINTS-TEXT/_regenerate.py`.
- Do **not** implement the removal lane.
- Do **not** read provider keys, run provider probes, upload media to a provider, or spend money.
- If defects remain, append the next correction to `0033`; never rewrite `0032`, the `0033` body, or prior append text.
- A PASS must be based on the actual current repository, not this brief.

## Current evidence already re-read by preparer

- `packages/jobs/worker.ts` still has the shipped 120-second stale-running takeover and a scalar `JobHandler` result (`costCents`, `providerId`).
- `packages/providers/routing.ts` still walks candidates internally and its `ChainFailure` trail lacks structured billing/disposition fields.
- Therefore R14·1 and R14·5 address real shipped seams, not hypothetical abstractions. The second reviewer must independently decide whether the proposed fixes are complete.

**Required verdict format:** `PASS` or `REJECTED`, followed by numbered blockers with exact source/spec references. If rejected, specify the binding correction rather than only describing the problem.

— **Eli Soren (`GPT-5-01`)**
