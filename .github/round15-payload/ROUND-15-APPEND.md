
---

## ROUND 15 APPEND — Marcus REVIEW-001 correction: job authority, durable execution dispatch, ordinal namespace, exhaustion billing, and tests

**Correction date:** 2026-08-01 EDT  
**Written by:** `GPT-5-01` — **Eli Soren** (ChatGPT / GitHub build lane)  
**Independent review source:** `_LOGS/AI-REVIEW-JOBS/VERDICT-REVIEW-001_2026-08-01_MARCUS-SOREN.md`  
**Exact Round-14 commit reviewed by Marcus:** `f82cd31cf900307a6ea5c8f4c396f558b4aab724`

**Independent verdict: REJECTED.** Marcus verified every Round-14 citation, cleared **R14·2** and **R14·4**, and reproduced five remaining blockers across R14·1, R14·3, R14·5, and R14·6. I re-read each finding against the authoritative Round-14 append and the shipped code seams before adopting it. The findings are correct.

No source code, migration, test, blueprint, provider configuration, or key was changed while writing this correction. No provider call, probe, upload, or spend occurred.

### R15·1 — The provider-attempt poll fence does not fence the executing worker's own `jobs` writes

Marcus found a concrete zombie-worker path that Round 14 did not close:

- `packages/queue/runtime.ts:94-98` releases a retrying job with `WHERE id=$1 AND status='running'` only.
- `packages/jobs/worker.ts:62-65` renews the heartbeat with `WHERE id=$1` only.
- `packages/jobs/worker.ts:68-72` writes terminal success with `WHERE id=$1` only; the terminal failure write is likewise unguarded.

Worker A can stall past 120 seconds, worker B can reclaim the row and increment `jobs.attempt`, and worker A can then reset, renew, fail, or overwrite worker B's live row. In the graceful-release case, A can set B's job back to `queued`, enabling another claim and a second provider submission. Round 14's attempt-scoped poll lease protects `provider_operation_attempts`; it does not protect these separate `jobs` writes.

**Binding correction — the frozen claim-time attempt is the job-row execution fence.**

- The winning §4 claim returns `jobs.attempt` after increment. Call this immutable value **`claim_attempt`** for the lifetime of that worker execution.
- **Every worker-owned write to `jobs` is guarded by the same authority predicate:**
  `WHERE id=$job_id AND status='running' AND attempt=$claim_attempt`.
  This includes heartbeat renewal, terminal success, terminal failure, transitions into any parked state, and the graceful retry release back to `queued`.
- A guarded write that affects zero rows means the worker has lost job authority. It must:
  1. stop heartbeat renewal;
  2. stop provider submit/poll work through its execution `AbortSignal`;
  3. perform no terminal, parked, release, ledger-rollup, or realtime-state publication for that job;
  4. return/throw only in the transport-specific manner that lets the authoritative replacement continue.
- **Realtime publication is downstream of the guarded commit.** `publishState` / equivalent events fire only after the guarded state transaction affects exactly one current row. A zombie cannot publish a false terminal state after its database write lost.
- **Before every provider-side effect** (submit, poll, cancel) the worker must prove both authorities that apply:
  - current job authority: `(job_id, claim_attempt)` still owns the `jobs` row;
  - current provider-poll authority, when polling: the R14·1 attempt id + poll owner token + poll generation lease.
  Losing either authority aborts the side effect. The poll lease does not replace the job-attempt fence, and the job-attempt fence does not replace the poll lease.
- The later `0034` §4.2 amendment must carry `claimAttempt` through the worker/runtime boundary so `runtime.ts`'s graceful release can use it; a caller that knows only `jobId` is no longer sufficient.

**Heartbeat limitation recorded, not silently “fixed.”** The shipped 30-second heartbeat is timer-driven liveness, not proof of forward progress. A live-but-wedged process can renew forever. Round 15 does not invent a progress watchdog; it records that limitation so the 120-second rule is not misdescribed as progress detection.

### R15·2 — A committed continuation needs a separate durable execution outbox; no Redis write belongs in the wake transaction

Marcus correctly identified that R14·3 moved the lost-wake gap but did not eliminate it. A BullMQ enqueue is a Redis/network write and cannot share the Postgres transaction. Enqueueing before COMMIT can publish work whose state rolls back; enqueueing after COMMIT can be lost if the process dies in the gap.

R12·8 also binds an important separation: `execute` is **not** a `wake_kind` and is never stored in `job_wakeup_outbox`. Round 15 preserves that rule rather than overloading the wake table again.

**Binding correction — add a dedicated transactional execution outbox.**

New additive table **`job_execution_outbox`**:

- `id TEXT PRIMARY KEY` — ULID, never an integer-only BullMQ custom id;
- `target_job_id TEXT NOT NULL REFERENCES jobs(id)`;
- `routing_attempt_id TEXT NULL REFERENCES routing_attempts(id)` — non-null for a routed continuation;
- `execution_key TEXT NOT NULL UNIQUE` — deterministic business key:
  `H('execute-continuation-v1', target_job_id, routing_attempt_id)` for the continuation path;
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
- `dispatch_generation INT NOT NULL DEFAULT 0`;
- `dispatch_lease_expires_at TIMESTAMPTZ NULL`;
- `dispatched_at TIMESTAMPTZ NULL`;
- partial scan index on `(created_at) WHERE dispatched_at IS NULL`.

For a funded follower continuation, the one R14·3 Postgres transaction now performs the complete durable handoff:

1. lock the source `job_wakeup_outbox` row and require `consumed_at IS NULL`;
2. lock the target `jobs` row and the exact active follower attachment;
3. compute the operation outcome and, when a new paid continuation is required, create/replay the deterministic routing attempt and perform the R14·4 budget decision;
4. funded branch: install exactly one active execution binding, set the target job to `queued`, and insert/replay the `job_execution_outbox` row;
5. refused branch: install no execution binding and no execution-outbox row; commit `failed/BUDGET_EXCEEDED` as R14·4 requires;
6. resolve/re-park the follower attachment as appropriate;
7. write the source wake's `consumed_at=now()` last;
8. COMMIT.

**No queue/Redis/provider/network call occurs inside this transaction.** After COMMIT, an execution-outbox relay:

- claims an undispatched row with a lease;
- loads authoritative `jobs.type` for the queue name;
- enqueues the `execute` delivery `{ kind:'execute', jobId: target_job_id }`;
- uses BullMQ custom id `exec-{outbox_id}-{dispatch_generation}` — hyphenated, non-integer, no colon;
- stamps `dispatched_at` after enqueue.

Crash behavior is binding:

- crash before Postgres COMMIT ⇒ source wake remains unconsumed and no execution-outbox row exists;
- crash after COMMIT but before Redis enqueue ⇒ the durable execution-outbox row remains for the relay;
- crash after enqueue but before `dispatched_at` ⇒ at-least-once redelivery; the queue id, §4 claim, and R15·1 attempt fence prevent double execution/state writes;
- budget refusal ⇒ no executable message can ever be emitted because no execution-outbox row exists.

`job_wakeup_outbox` remains the continuation-wake outbox. `job_execution_outbox` is the execute-delivery outbox. The two contracts are not alternatives and are never inferred from mutable job status.

**Canonical lock order for continuation transactions:** source wake row → target job row → active follower row → owner budget row → routing/reservation/binding rows. The owner budget lock intentionally serializes concurrent funding decisions for one owner; that throughput ceiling is accepted for correctness and must not be bypassed by taking the locks in another order.

### R15·3 — One routed continuation gets one fresh §4 execution attempt; candidate ordinals cannot collide

Marcus correctly found that R14·5 silently changed `provider_attempt_no` from “ordinal within the execution attempt's chain walk” to “ordinal in a routing attempt's frozen chain snapshot” while retaining:

`UNIQUE (job_id, execution_attempt, provider_attempt_no) WHERE origin='direct'`.

If two routing attempts execute under one frozen `jobs.attempt`, both can produce candidate ordinal 0 and the second real charge cannot be inserted.

**Binding correction — choose option (a), with structural enforcement: every funded continuation is a fresh queued execution and therefore receives a fresh §4 `jobs.attempt`.**

- R15·2 ends the continuation transaction with the target job at `queued` plus one durable execution-outbox row. The continuation wake handler does **not** run the provider chain inline.
- The execution-outbox delivery enters the normal §4 claim. The one winning claim increments `jobs.attempt`; that returned value is the new `claim_attempt` / direct-ledger `execution_attempt`.
- `routing_attempts` gains `execution_attempt INT NULL`. It is NULL while the continuation is prepared but not yet claimed.
- In the **same short Postgres transaction as the winning §4 job claim**, the worker binds the one active `routing_attempt_id` to the returned `claim_attempt` using:
  `UPDATE routing_attempts SET execution_attempt=$claim_attempt ... WHERE id=$routing_attempt_id AND job_id=$job_id AND execution_attempt IS NULL`.
  If this bind does not affect exactly one row, the entire job claim transaction rolls back; a worker never owns a job attempt without owning its routed work.
- Add partial uniqueness:
  `UNIQUE (job_id, execution_attempt) WHERE execution_attempt IS NOT NULL` on `routing_attempts`.
  Thus one routed chain walk — and only one — belongs to one execution attempt.
- The provider chain may begin only after the active execution binding, job claim, and routing-attempt execution binding all agree on `(job_id, routing_attempt_id, claim_attempt)`.
- **`provider_attempt_no` is restored to the R13·4 meaning:** 0-based ordinal in the one frozen chain snapshot walked by that execution attempt. R14·5's wording is narrowed accordingly; it does not define an ordinal independent of `execution_attempt`.
- A later logical continuation creates another routing attempt, another execution-outbox row, another winning §4 claim, and therefore another `execution_attempt`. Candidate 0 from the two continuations occupies two different primary grains and cannot collide.
- A duplicate execution delivery that loses the §4 claim cannot bind or walk the routing attempt and cannot increment a candidate ordinal.

This keeps R13·4's direct-ledger grain. It does **not** add `routing_attempt_id` to direct ledger rows and does not invent a cross-walk monotonic ordinal allocator.

### R15·4 — Success and total exhaustion must both carry structured charge events; the type must enforce charge-state invariants

Marcus verified that the shipped all-candidates-failed path converts `ChainFailure[]` into a formatted string and throws `NO_PROVIDER`. Round 14 described `chargeEvents` on the handler outcome but did not bind the exhaustion error path. That can erase every billed failed candidate.

**Binding correction — one structured charge-event contract crosses success and failure paths.**

```ts
type ProviderChargeEventBase = {
  providerAttemptNo: number;          // ordinal bound by R15·3
  providerConnectionId: string;
  providerOperationRef?: string;
  providerChargeId?: string;
  submissionDisposition: 'preaccept_rejected' | 'accepted' | 'ambiguous';
  errorCode?: string;
};

type ProviderChargeEvent =
  | (ProviderChargeEventBase & {
      chargeState: 'none';
      costCents?: never;
    })
  | (ProviderChargeEventBase & {
      chargeState: 'known';
      costCents: number;
    })
  | (ProviderChargeEventBase & {
      chargeState: 'unknown';
      costCents?: never;
    });
```

Cross-field rules are binding:

- `preaccept_rejected` is the only disposition that may use `chargeState:'none'`, and only when no provider job/charge was accepted;
- `accepted` or `ambiguous` carries `known` or `unknown`, never an assumed `none`;
- `known` requires `costCents` at the type level; `none`/`unknown` prohibit it;
- every candidate actually touched emits exactly one event, including the final failed candidate.

The amended chain/handler boundary has two structured outcomes:

- success: normal output plus `chargeEvents: ProviderChargeEvent[]`;
- failure/exhaustion: a typed execution failure carrying machine `errorCode`, retryability, detail, and the same `chargeEvents` array.

The all-candidates-failed path must throw/return a typed `NO_PROVIDER` failure whose structured `chargeEvents` survive intact. A human-readable detail string may be derived from those events, but it is never the sole representation. An empty eligible chain produces `chargeEvents: []` and fails before spend.

Before retry or terminal failure, the §4 accounting transaction processes all events:

- every known billed event is idempotently written under
  `(job_id, execution_attempt, provider_attempt_no)`;
- every accepted/ambiguous unknown event enters reconciliation and blocks automatic retry;
- `jobs.cost_cents` is recomputed from the reconciled ledger sum and is never overwritten by a scalar handler value;
- `provider_connection_id` remains non-null for every direct row and the scoped provider-charge secondary guard from R13·5 remains in force.

### R15·5 — Required tests added and prior tests reconciled

The following tests are additive to every surviving test through Round 14:

1. **Zombie job-write fence:** worker A owns attempt N and stalls; worker B takes over at N+1. A's heartbeat, graceful release, terminal success, and terminal failure writes each affect zero rows. B's row/output/cost/provider remain unchanged, A emits no state event, and provider submission counter remains 1.
2. **Authority-loss side-effect abort:** after takeover, A fails its `(job_id, claim_attempt)` authority check before a submit/poll/cancel and its execution signal aborts; provider-side-effect counter does not increase.
3. **Execution-outbox crash windows:** funded continuation crash (a) before COMMIT leaves the source wake unconsumed and no execution-outbox row; (b) after COMMIT/before enqueue leaves one undispatched execution row that the relay later delivers; (c) after enqueue/before stamp re-delivers at least once but produces one winning job claim and one provider execution.
4. **Budget refusal emits no execution:** refusal commits one `budget_refused` routing attempt, zero held reservations, zero execution bindings, zero `job_execution_outbox` rows, a consumed source wake, and terminal `failed/BUDGET_EXCEEDED`.
5. **Continuation-key crash determinism:** force rollback after `continuation_generation` increments but before COMMIT; retry the same wake and assert the generation and `H('continuation-v1', ...)` key are byte-identical to the aborted calculation, with one committed routing attempt.
6. **Fresh-attempt ordinal namespace:** the same job completes two logical routed continuations. Each continuation receives a different claim-time `execution_attempt`; both walks may emit `provider_attempt_no=0`; both direct ledger rows coexist and the `(job_id, execution_attempt, provider_attempt_no)` unique index passes.
7. **Routing-attempt bind atomicity:** force the `routing_attempts.execution_attempt IS NULL` bind to lose. Assert the enclosing §4 job claim rolls back, `jobs.attempt` does not advance, no chain walk starts, and the winning binding remains authoritative.
8. **All-candidates-failed billing survival:** all candidates fail, at least one with `chargeState:'known'`. The typed `NO_PROVIDER` failure retains every charge event; known billed rows are committed before terminal handling; unknown accepted/ambiguous blocks retry; no event is recoverable only from a string.
9. **Charge-event type safety:** compile-time/type tests reject `chargeState:'known'` without `costCents`, reject a cost on `none`/`unknown`, and reject `preaccept_rejected` paired with `known`/`unknown` under the runtime schema.
10. **Canonical lock order:** two concurrent continuations for one owner take wake → job → follower → budget locks in that order; one waits without deadlock and funding decisions serialize against the same cap.

**Round-14 test reconciliation:**

- R14 tests 1, 2, 5, 7, and 8 remain unchanged.
- R14 test 3 is **amended** by Round-15 test 5; duplicate delivery alone did not prove key derivation.
- R14 test 4 is **amended** by Round-15 test 3 to cover the post-COMMIT/pre-Redis window.
- R14 test 6 is **amended** by Round-15 tests 6 and 8 to cover a later continuation and total exhaustion.
- No surviving earlier test is retracted.

### Carried conditions and explicit non-decisions

- The timer heartbeat is liveness-only; progress watchdog design remains outside this correction.
- Owner-level budget locking is a deliberate serialization point for correctness.
- The shipped general `createJob` budget pre-check remains TOCTOU-racy and blind to in-flight direct spend. Marcus correctly flagged it; it is outside the removal-lane Round-15 correction and must receive its own future work order before the project claims cap correctness across all job types.
- A previously accepted/billed operation is never erased because a later continuation is refused. Existing ledger facts remain. The exact UI wording for showing “failed for budget after prior incurred spend” remains an owner-facing product decision.
- Marcus Soren's claude.ai account still needs an owner-confirmed registry identifier. His supplied REVIEW-001 files are preserved under the owner-recognized display signature; no identifier was invented here.

### Status after Round 15

`0032` (base) + `0033` (binding correction + rounds 5–15) remain the removal-lane specification.

**STILL NOT BUILD-AUTHORIZED.** Round 15 answers Marcus REVIEW-001, but it must receive a new independent specification review. `0034` remains reserved and unexecuted. Do not modify VHE-2 §4.1/§4.2, do not run `_BLUEPRINTS-TEXT/_regenerate.py`, and do not implement the removal lane until Round 15 clears review.

No provider probe is authorized. Nothing was keyed, sent to a provider, uploaded to a provider, or spent.

— **Eli Soren (`GPT-5-01`)**, 2026-08-01
