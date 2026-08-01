# ACTIVE REVIEW 001 — Round-14 removal-lane specification review

**Assignment ID:** `REVIEW-001`  
**Requested by:** Ashley  
**Prepared by:** Eli Soren (`GPT-5-01`)  
**Repository:** `505ccreate/VHE`  
**Canonical branch:** `main`  
**Review type:** Independent specification review only  
**Implementation authorized:** **NO**

## Mission

Independently review the six Round-14 binding corrections appended to:

`_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_removal-lane-binding-correction_CC-OPUS-01.md`

Determine whether those corrections fully resolve the Round-13 defects without introducing contradictions, undefined identifiers, impossible transaction ordering, unrepresentable states, races, or data-channel gaps.

The reviewer must not rely on Eli Soren’s conclusion. Reproduce the review from the cited specification and shipped source seams.

## Authority and reading order

Read in this order:

1. `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md`
2. `_LOGS/AI-REVIEW-JOBS/README.md`
3. This assignment
4. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_removal-lane-binding-correction_CC-OPUS-01.md` — Round 14 append, plus only the earlier sections needed to verify references
5. `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0032_removal-lane-specification_CC-OPUS-01.md` — base specification
6. The shipped source/schema seams listed below
7. The latest handoff from Eli Soren for migration/Round 14 context

Later append text governs on conflict, but do not allow a later append to hide an unresolved contradiction elsewhere in the live specification chain.

## Six required review targets

### 1. Unified poll-ownership fence

Verify whether Round 14 correctly resolves the job-worker-versus-reconciler race by using one attempt-scoped lease and generation fence. Check that:

- ordinary job workers and reconcilers compete through the same CAS;
- stale or zombie owners cannot poll or write results after replacement;
- ownership is scoped to the exact provider operation attempt;
- a new attempt cannot inherit the prior attempt’s lease;
- all identifiers and timing rules are defined.

Primary source seam: `packages/jobs/worker.ts`, especially the stale-running takeover predicate and heartbeat cadence.

### 2. Follower continuation-key provenance

Verify that the corrected routing key:

`H('continuation-v1', job_id, prior_follower_routing_attempt_id, continuation_generation)`

uses only durable, defined fields; increments the generation exactly once per logical continuation; and prevents duplicate deliveries from minting duplicate routing attempts.

### 3. Wake-consumption transaction boundary

Verify that `consumed_at` is written only in the same short Postgres transaction that installs the complete durable next state. Check crash behavior before and after COMMIT and confirm no provider/network call is held inside the transaction.

### 4. Budget-refusal state and ordering

Verify that `routing_attempts.state='budget_refused'` is a complete, legal terminal outcome and that funded/refused ordering respects all foreign keys and uniqueness rules. Confirm no committed `reserved` attempt can exist without its reservation and no refused attempt can become executable.

### 5. Per-candidate direct-billing transport

Verify that `ProviderChargeEvent[]` is sufficient to carry every provider candidate’s ordinal, connection, submission disposition, charge state, cost, and operation/charge references across the chain-walker/handler/worker boundary.

Primary source seams:

- `packages/providers/routing.ts` — current `walkChain`, `ChainFailure`, and `WalkOutcome`
- `packages/jobs/worker.ts` — current scalar `JobHandler` result and terminal accounting write

Check whether the Round-14 correction still leaves any earlier billed candidate capable of disappearing inside fall-through.

### 6. Test completeness

Verify that the additive Round-14 tests actually exercise the new cross-system invariants, including:

- job worker versus reconciler lease race;
- zombie write rejection;
- attempt isolation;
- deterministic continuation key under duplicate delivery;
- crash boundaries around COMMIT;
- funded and budget-refused branches;
- uniqueness-race replay;
- multiple provider candidates with mixed charge states;
- reconciliation blocking automatic retry when charge is unknown.

Identify any missing test that would allow an invalid implementation to pass.

## Shipped source/schema seams to inspect

At minimum:

- `packages/jobs/worker.ts`
- `packages/jobs/create.ts`
- `packages/jobs/errors.ts`
- `packages/providers/routing.ts`
- `packages/queue/runtime.ts`
- `packages/queue/queues.ts`
- `migrations/0001_schema.sql`

Read additional files only when a Round-14 claim depends on them.

## Hard prohibitions

The reviewer must **not**:

- edit VHE-2 §4.1 or §4.2;
- execute reserved `0034`;
- regenerate blueprint mirrors;
- implement removal-lane code;
- rewrite `0032`, the body of `0033`, or any prior append;
- read provider keys;
- call provider APIs;
- run a paid probe;
- upload media to a provider;
- spend money;
- declare PASS merely because the proposal sounds reasonable.

## Required verdict format

Create:

`_LOGS/AI-REVIEW-JOBS/VERDICT-REVIEW-001_<YYYY-MM-DD>_<REVIEWER-SIGNATURE>.md`

For each target use:

- **Target:** R14·1 through R14·6
- **Verdict:** PASS / BLOCKED
- **Evidence inspected:** exact files, sections, or lines
- **Reasoning summary:** concise, reproducible explanation
- **Required correction:** only when blocked

End with exactly one overall verdict:

- `PASS — Round 14 clears independent review`
- `PASS WITH CONDITIONS — list exact non-build conditions`
- `REJECTED — list exact remaining blockers`

Also state:

- whether source/tests were changed;
- whether tests were run and their exact results;
- whether any network/provider/key/spend action occurred;
- the recommended next gate.

## Review ownership

Eli Soren authored Round 14 and therefore **cannot independently clear this assignment**. Suitable reviewers include Marcus Soren, Marcus Junior, Eli Junior, or another AI account registered for this project and not acting as the Round-14 author.

— Prepared by **Eli Soren (`GPT-5-01`)**, 2026-08-01.
