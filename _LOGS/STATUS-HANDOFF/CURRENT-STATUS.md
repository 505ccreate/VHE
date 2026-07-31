# CURRENT STATUS — read this first

**Last updated:** 2026-07-31 EDT by `GPT-5-01` / **Eli Soren** (ChatGPT GitHub build lane).

## Current truth

**GitHub migration: PASS.** The authoritative `VHE-Progress-update 16_2026-07-27.zip` was migrated to
`505ccreate/VHE` on canonical branch `main`. The one-shot import verified the exact expected ZIP SHA-256,
extracted exactly **168 files**, verified the package provenance/status/package files, imported the tree,
and removed its temporary migration inbox/workflow. Import commit:
`4722bceef89f00be441e62fd4a37058ebe606c9c`.

`PACKAGE-PROVENANCE.md` on `main` reports the package's historic build HEAD
`6d00b541f20f3f46481045182e69f7e865ab1b6b`, clean build-time status, 166 lean tracked files + the two
provenance/manifest entries = 168, and no credential-bearing `.env` file.

**Removal-lane specification: REJECTED at round 14 with 6 blockers.** Round 14 was appended to
`VHE-ISSUE-LOG-0033`; the imported round-13 file was verified as the exact byte-prefix before the append.
Append commit: `9d68b2485890df82aa5db21aded03838617fa8b0`.

**➡ CURRENT GATE — `0032` (base) + `0033` (binding correction + rounds 5–14) are the removal-lane
specification. STILL NOT BUILD-AUTHORIZED.** Later appends govern on conflict.

**➡ NEXT ACTION — independent specification review of the round-14 corrections.** This is still **not**
a provider probe and **not** removal-lane implementation.

## `0034` remains reserved and unexecuted

Round 12 authorized a documented VHE-2 §4.2 amendment, and round 13 correctly deferred execution until the
removal-lane specification clears review. Round 14 adds requirements that the eventual amendment must
carry, especially the per-candidate direct-billing transport. Therefore:

- **Do not modify VHE-2 §4.1 or §4.2 yet.**
- **Do not run `_BLUEPRINTS-TEXT/_regenerate.py` yet.**
- **Do not implement the removal lane yet.**
- When the spec is finally accepted, one deliberately scoped `0034` must cover the already-authorized
  typed §4.2 execution accounting contract together with the §4.1 queue-payload change that belongs to the
  same contract. Any owner authorization requirement still recorded in prior handoffs remains in force.

## Round-14 blockers now binding

1. **Poll ownership:** round 13's reconciler-only lease does not fence the shipped stale-job takeover.
   Correction: one **attempt-scoped poll lease** shared by job workers and reconcilers, guarded by owner
   token + generation on every poll/result write; retract the reconciler-only ownership columns on the
   permanent operation row.
2. **Follower continuation key:** `original decision key` is undefined on an outbox-driven follower path.
   Correction: derive the deterministic continuation key from `job_id`,
   `prior_follower_routing_attempt_id`, and `continuation_generation` only.
3. **Wake consumption transaction:** `consumed_at` cannot commit after only the resume claim. For follower
   continuation, one short Postgres transaction must own the wake from claim through the durable next
   state, with `consumed_at` written last. No network call inside that transaction.
4. **Budget-refusal routing state/order:** add terminal non-executable `budget_refused`; atomically commit
   either funded `reserved` + held reservation/binding or refused `budget_refused` + no reservation/no
   binding + terminal `BUDGET_EXCEEDED` outcome. Deterministic-key losers replay the winner.
5. **Direct ledger transport:** R13's `(job_id, execution_attempt, provider_attempt_no)` grain cannot be
   populated by the shipped scalar handler contract. The future `0034` contract must carry per-candidate
   `ProviderChargeEvent[]` with ordinal, provider connection, submission disposition, charge state, cost,
   and provider billing identifiers where available. Unknown accepted/ambiguous charges park for
   reconciliation before retry/fall-through.
6. **Tests:** eight additive cross-system tests are required for poll races/fencing, continuation-key
   provenance, crash boundary, budget refusal, multi-candidate billing, unknown-charge retry blocking, and
   scoped charge-id/direct-row constraints.

The full wording and test contracts are in the round-14 append to `0033`; this file is only the status
summary.

## Reading order for the next builder/reviewer

1. `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — this file.
2. `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-31-46_chatgpt-web_GPT-5-01.md` — migration + round-14 handoff.
3. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_removal-lane-binding-correction_CC-OPUS-01.md` — body +
   **rounds 5–14**. Later append wins on conflict.
4. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0032_removal-lane-consolidated-implementation-spec_CC-SONNET-01.md`
   — base spec.
5. Shipped seams cited by round 14: `packages/jobs/worker.ts`, `packages/providers/routing.ts`,
   `packages/queue/runtime.ts`, `packages/queue/queues.ts`, `packages/jobs/create.ts`,
   `packages/jobs/errors.ts`, `migrations/0001_schema.sql`.

## Build state that remains true

The imported Update-16 source already contains the work completed before this GitHub lane. Do **not**
rebuild it from scratch. The existing logs remain the authority for which sections were built and what was
actually verified. Among the imported history: core Phase-0/repair scaffolding, job lifecycle, masks,
provider routing, image-repair work, deterministic video-repair/windowing work, and their recorded tests
exist; the removal-lane under review is a later specification gate, not permission to rewrite those earlier
lanes.

**No tests were re-run during the 2026-07-31 round-14 work block.** The work was package migration,
source/spec inspection, and documentation. Any older Vitest/preflight counts remain historical measurements
from their named commits; do not report them as freshly run.

## Explicitly NOT done in this block

- No removal-lane source implementation.
- No VHE-2 blueprint change; `0034` not executed.
- No provider key read.
- No fal/provider metadata probe.
- No provider upload/network call.
- No spend.
- No new full backup ZIP/repository yet.

## Carry-over outside the round-14 spec gate

- The live/provider-validation lane still has its prior authorization requirements and configuration
  dependencies (including the recorded `S3_REGION`/fixture matters). Do not pull those forward while the
  current spec gate is rejected.
- Backup discipline remains: source repo stays clean; full/progress ZIPs belong in the separate backup
  location/repository once that lane is created.

— **Eli Soren (`GPT-5-01`)**, 2026-07-31
