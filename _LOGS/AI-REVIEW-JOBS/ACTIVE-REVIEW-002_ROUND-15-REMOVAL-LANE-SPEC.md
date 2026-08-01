# ACTIVE REVIEW 002 — Round-15 removal-lane specification review

**Assignment ID:** `REVIEW-002`  
**Requested by:** Ashley  
**Prepared by:** Eli Soren (`GPT-5-01`)  
**Repository:** `505ccreate/VHE`  
**Canonical branch:** `main`  
**Review type:** Independent specification review only  
**Implementation authorized:** **NO**

## Mission

Independently review the Round-15 binding correction appended to:

`_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_removal-lane-binding-correction_CC-OPUS-01.md`

Determine whether Round 15 fully resolves Marcus Soren's `REVIEW-001` findings without introducing a new
race, dual-write gap, impossible transaction, conflicting namespace, unrepresentable outcome, or test hole.
Do not rely on Eli Soren's conclusion; reproduce every material claim against the live specification and
shipped source seams.

## Authority and reading order

Read in this order:

1. `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md`
2. `_LOGS/AI-REVIEW-JOBS/README.md`
3. This assignment
4. `_LOGS/AI-REVIEW-JOBS/VERDICT-REVIEW-001_2026-08-01_MARCUS-SOREN.md`
5. the **Round-15 append** at the tail of `VHE-ISSUE-LOG-0033`
6. only the earlier `0033` sections needed to verify Round-15 references
7. `VHE-ISSUE-LOG-0032` — the base removal-lane specification
8. the shipped source/schema seams listed below
9. the latest Eli Soren handoff

Later append text governs on conflict, but do not permit Round 15 to hide a contradiction with a surviving
earlier rule or test.

## Five required review targets

### 1. Job-attempt authority fence

Verify R15·1 end to end:

- every worker-owned `jobs` write is guarded by the frozen claim-time attempt, not merely by job id/status;
- heartbeat, parked/terminal writes, graceful retry release, ledger rollup, and realtime publication cannot
  be performed by a zombie worker;
- authority loss cancels or prevents provider submit/poll/cancel side effects;
- the job-attempt fence and provider poll lease coexist without leaving an unfenced write path;
- `claimAttempt` can be carried through the worker/runtime contract without ambiguity.

Primary seams: `packages/jobs/worker.ts`, `packages/queue/runtime.ts`, and the Round-14 attempt-level poll
lease text.

### 2. Durable execution dispatch after continuation COMMIT

Verify R15·2:

- `job_execution_outbox` is a separate, complete contract rather than an alternative spelling of
  `job_wakeup_outbox`;
- a funded continuation commits its binding, queued job state, execution intent, and source-wake
  consumption atomically in Postgres;
- no Redis/queue/provider/network call occurs in that transaction;
- crashes before COMMIT, after COMMIT/before enqueue, and after enqueue/before dispatch stamp are all
  recoverable without lost or double execution;
- budget refusal structurally cannot emit an execute delivery;
- the queue id is legal under the BullMQ restrictions already established in prior rounds;
- the canonical lock order is complete and cannot deadlock with another specified path.

### 3. Routing-attempt/execution-attempt namespace

Verify R15·3:

- every funded logical continuation truly enters a fresh normal §4 claim and receives a fresh
  `jobs.attempt`;
- job claim plus `routing_attempts.execution_attempt` binding is one atomic transaction;
- a failed routing-attempt bind rolls the job claim back completely;
- the partial uniqueness rules make one routed walk belong to one execution attempt;
- two continuations may both use candidate ordinal 0 without colliding in the direct ledger;
- duplicate deliveries cannot walk or bill the same routing attempt twice.

### 4. Structured billing on success and total exhaustion

Verify R15·4:

- the discriminated `ProviderChargeEvent` type enforces its cost/disposition rules rather than relying on
  prose alone;
- every touched candidate contributes exactly one structured event;
- both successful fall-through and all-candidates-failed `NO_PROVIDER` outcomes preserve the full event
  array across chain, handler, and worker boundaries;
- known charges are recorded before retry/termination;
- accepted/ambiguous unknown charges enter reconciliation and block automatic retry;
- an empty eligible chain still fails before spend with an empty event list;
- no billed event survives only inside a human-readable error string.

Primary seams: `packages/providers/routing.ts`, `packages/jobs/worker.ts`, and the prior direct-ledger rules.

### 5. Test completeness and surviving-rule consistency

Verify the ten Round-15 tests and the stated reconciliation of Round-14 tests. Specifically attempt to
construct an invalid implementation that still passes them. Check for missing coverage around:

- stale-worker writes and provider side effects;
- all three execution-outbox crash windows;
- rollback/retry determinism of `continuation_generation` and routing keys;
- atomic job/routing-attempt claim binding;
- multiple logical continuations with ordinal reuse;
- all-candidates-failed billed and unknown-charge cases;
- cross-field type/schema validation;
- lock order and budget serialization;
- any surviving earlier test that now contradicts Round 15.

## Shipped source/schema seams to inspect

At minimum:

- `packages/jobs/worker.ts`
- `packages/jobs/create.ts`
- `packages/jobs/errors.ts`
- `packages/providers/routing.ts`
- `packages/queue/runtime.ts`
- `packages/queue/queues.ts`
- `migrations/0001_schema.sql`
- the relevant `0033` outbox, routing-attempt, ledger, poll-lease, and test sections

Read additional files only when a Round-15 claim depends on them.

## Hard prohibitions

The reviewer must **not**:

- edit VHE-2 §4.1 or §4.2;
- execute reserved `0034`;
- regenerate blueprint mirrors;
- implement removal-lane code;
- rewrite `0032`, the body of `0033`, or any prior append;
- silently repair Round 15 while reviewing it;
- read provider keys, call provider APIs, run a paid probe, upload provider media, or spend money;
- declare PASS merely because the proposed design sounds reasonable.

## Required verdict format

Create:

`_LOGS/AI-REVIEW-JOBS/VERDICT-REVIEW-002_<YYYY-MM-DD>_<REVIEWER-SIGNATURE>.md`

For each target use:

- **Target:** R15·1 through R15·5
- **Verdict:** PASS / BLOCKED
- **Evidence inspected:** exact files, sections, or lines
- **Reasoning summary:** concise, reproducible explanation
- **Required correction:** only when blocked

End with exactly one overall verdict:

- `PASS — Round 15 clears independent review`
- `PASS WITH CONDITIONS — list exact non-build conditions`
- `REJECTED — list exact remaining blockers`

Also state whether source/tests changed, whether tests were run and their exact results, whether any
network/provider/key/spend action occurred, and the recommended next gate.

## Review ownership

Eli Soren authored Round 15 and cannot independently clear this assignment. Marcus Soren may review it
because he authored the prior verdict, not Round 15. Marcus Junior, Eli Junior, or another properly
identified independent AI may also review it. Do not invent a registry identifier; use the owner-recognized
display signature and flag missing registration.

— Prepared by **Eli Soren (`GPT-5-01`)**, 2026-08-01.
