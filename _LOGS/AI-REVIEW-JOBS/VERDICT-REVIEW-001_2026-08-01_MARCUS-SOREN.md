# VERDICT — REVIEW-001 · Round-14 removal-lane specification review

**Reviewer:** **Marcus Soren** — Claude AI (claude.ai web, Claude Opus 5)
**Assignment:** `_LOGS/AI-REVIEW-JOBS/ACTIVE-REVIEW-001_ROUND-14-REMOVAL-LANE-SPEC.md`
**Repository:** `505ccreate/VHE` · branch `main`
**Exact commit reviewed:** `f82cd31cf900307a6ea5c8f4c396f558b4aab724` ("Close permanent AI review-system work block — Eli Soren", 2026-08-01)
**Review date:** 2026-08-01
**Implementation performed:** **NONE.** Review and consultation only, per the assignment.

> ⚠️ **Signature note — flagged, not invented.** `_LOGS/AI-REVIEW-JOBS/README.md` lists **Marcus Soren — Claude AI** as an owner-recognized display signature, but `_LOGS/AI-ACCOUNT-REGISTRY.md` has **no row for a claude.ai account**; every `CC-*` row is Claude Code. Per AGENTS.md I did not invent an identifier. I have signed with the recognized display signature only, which README's "and its registered identifier **where available**" permits. **Ashley/Eli: this account needs a registry row before its next entry.**

---

## 1. Files actually read

**Governance:** `AGENTS.md` · `_LOGS/AI-REVIEW-JOBS/README.md` · the active assignment · `_LOGS/AI-ACCOUNT-REGISTRY.md` · `_LOGS/SESSION-PROTOCOL.md` · `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md`

**Specification:** `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_…_CC-OPUS-01.md` — the Round-14 append in full (L3297–3578), plus the earlier sections needed to verify its references: L1163–1200 (R8·3), L910–935 (R7·4/R7·5), L2294–2300 and L2729–2745 (direct-ledger grain), L2972–2989 (R13·1), L3082–3103 (R13·4), L1130–1145 (R8·2 `current_attempt_id`).

**Shipped seams:** `packages/jobs/worker.ts` · `packages/jobs/create.ts` · `packages/jobs/errors.ts` · `packages/providers/routing.ts` · `packages/queue/runtime.ts` · `packages/queue/queues.ts` · `migrations/0001_schema.sql`

I did **not** read `0032` in full; the assignment scopes it to reference verification and no Round-14 claim I tested depended on it beyond what `0033` restates.

## 2. Verification method

Every Round-14 factual claim about the spec chain and about shipped code was re-read at the cited line range rather than accepted. **All of Eli Soren's line citations are accurate** — `worker.ts:35-45`, `:39-40`, `:23-28`, `routing.ts:115-136` all resolve exactly as described. I record that explicitly because it is unusual and it materially raised my confidence in the rest of the append.

Two Round-14 claims I actively tried to falsify and **could not**:

- *Suspected:* `provider_operation_attempts` might be an undefined identifier introduced by R14·1. **False** — it is defined at L362 and carried throughout (35 occurrences); `current_attempt_id` is defined at L1130.
- *Suspected:* R14·4 step 3 might reproduce the very FK-ordering defect it corrects, if `budget_reservations.provider_operation_attempt_id NOT NULL` (L913) still stood. **False** — R8·3 (L1177–1180) explicitly retracts that FK to `accepted_provider_operation_attempt_id TEXT NULL`. The ordering is satisfiable.

No tests were run. No provider key was read, no provider API called, no probe, no upload, no spend, no network call other than `git clone` of this public repository.

---

## 3. Findings by target

### Target R14·1 — Unified poll-ownership fence
**Verdict: BLOCKED**

**Evidence:** `packages/jobs/worker.ts:35-45, 52-86` · `packages/queue/runtime.ts:69-99` · `0033` L2972–2989 (R13·1), L3338–3363 (R14·1).

The diagnosis is correct and the correction is the right shape. Attempt-scoping the lease, minting a fresh ULID owner token rather than reusing a job id or hostname, reusing the shipped 120 s/30 s timing instead of minting a second staleness definition, retracting R13·1's parallel ownership columns, and putting the lease on the attempt row so a new attempt cannot inherit it — all of that resolves the reconciler-vs-worker race as stated. `$lease` is now defined (120 s). Verified against R13·1's actual CAS at L2984–2987, which does test only `reconciler_owner_id`/`reconciler_lease_expires_at`, exactly as R14·1 says.

**Why it is still blocked: the fence covers provider-operation-attempt writes, and the shipped zombie damage happens on `jobs`-row writes that are neither polls nor poll-result writes.**

Two shipped writes are unfenced by attempt, owner token, or generation, and R14·1's wording ("every poll-result write") does not reach either:

1. **`runtime.ts:94-98` — release on graceful handback:**
   ```sql
   UPDATE jobs SET status='queued', heartbeat_at=NULL, updated_at=now()
   WHERE id=$1 AND status='running'
   ```
   Sequence: worker A stalls past 120 s → worker B takes over (`attempt+1`, `status='running'`, fresh heartbeat) → A's handler then throws retryably → A executes the release above, which matches **B's** row. B's live job is reset to `queued` with a NULL heartbeat while B is still executing it. A subsequent delivery can claim it and run the handler a second time. That is a **double provider submission**, i.e. the precise outcome §4's exit gate ("kill a worker mid-job, restart, resume without a second bill") exists to prevent.

2. **`worker.ts:68-72` — terminal success write:** `UPDATE jobs SET status='succeeded', … WHERE id=$1`, with no attempt or owner predicate. Zombie A completing after B's takeover overwrites B's row, including `cost_cents` and `provider_id`.

R14·1 asserts *"a zombie owner whose lease was replaced cannot write itself back into authority."* That is true of `provider_operation_attempts` under the correction and **false of `jobs`**, which is where the shipped code actually writes.

**Required correction.** Extend the fence to the job row: every `jobs` state transition performed by an executing worker (terminal write, graceful release, heartbeat renewal) must be guarded on the claim-time frozen `attempt` — minimally `AND attempt = $claimTimeAttempt` — or the correction must state explicitly that the poll lease is the sole authority and the `jobs` row carries no execution authority, and then say what does guard those two writes. Naming only "poll/result writes" leaves the shipped race open.

**Additional concern, not a blocker.** `executeClaimed`'s heartbeat is a bare `setInterval` (`worker.ts:62-65`) that writes `heartbeat_at=now()` regardless of whether the handler is making progress. A wedged-but-alive worker therefore renews forever and is never taken over, while the 120 s predicate that R14·1 deliberately inherits assumes heartbeat means liveness. Reusing that timing is right for consistency; the spec should record that it is inheriting a **timer-driven**, not progress-driven, liveness signal.

---

### Target R14·2 — Follower continuation-key provenance
**Verdict: PASS**

**Evidence:** `0033` L3365–3389 (R14·2), L3406–3416 (R14·3 transaction), L1163–1174 (R8·3 `routing_attempts`).

The undefined "original decision key" is correctly identified and correctly retracted for this path only, leaving operator-rerun semantics intact. All three inputs to `H('continuation-v1', job_id, prior_follower_routing_attempt_id, continuation_generation)` are durable and defined: `job_id` is trivially so; `prior_follower_routing_attempt_id` is sourced from the exact active `provider_operation_followers` row rather than from client or queue material; `continuation_generation` is incremented by `UPDATE … RETURNING` inside the winning transaction.

Generation-increments-exactly-once holds, but by a mechanism worth naming: it is enforced by R14·3 step 1's lock on the outbox row plus `consumed_at IS NULL`, **not** by the key derivation. A duplicate delivery never reaches the increment. The key's real work is idempotency across **crash-and-retry** of the whole transaction, where the rollback of the increment is what makes the recomputed key identical. That distinction is not a defect — but it is the reason R14·6 test 3 does not test what it claims (see R14·6).

One consequence to note: because the outbox lock already serialises duplicates, R14·4 step 5's uniqueness-race replay is **unreachable on the follower-continuation path**. It remains correct for the operator-rerun path. No change required; recording it so a future round does not mistake dead-for-this-path logic for a bug.

---

### Target R14·3 — Wake-consumption transaction boundary
**Verdict: BLOCKED**

**Evidence:** `0033` L3391–3424 · R12·3/R13·3 as quoted therein.

The diagnosis is exactly right: `consumed_at` committed with the resume claim alone permits the interleaving where the job is `running`, the wake is consumed, and no funded continuation exists. The six-step ordering with `consumed_at` written last, and the general invariant *"a wake is not consumed merely because `running` was written"*, close it. Crash-before-COMMIT consumes nothing; crash-after-COMMIT leaves the next state durable. That reasoning holds.

**Why it is blocked: the transaction's relationship to the queue is unstated, and the correction's crash-safety claim depends on it.**

R14·3 forbids provider/network calls inside the transaction — correct. But a BullMQ enqueue is a write to **Redis**, a non-transactional store, and step 4's "install the new execution binding" does not say whether resuming execution requires one, or where it happens relative to COMMIT. Both readings are broken and the spec does not choose:

- **Inside the transaction:** it violates R14·3's own no-network rule and creates a dual-write — Redis accepts the enqueue, Postgres rolls back, and a queued message points at state that never committed.
- **After COMMIT:** a crash in the gap between COMMIT and enqueue leaves a durably-installed continuation with nothing scheduled to run it. The wake is consumed, so the outbox will not re-deliver. That is a permanently stalled job — the same lost-wake class R14·3 was written to close, relocated to the other side of the commit.

The project already owns the correct mechanism (`job_wakeup_outbox` + a relay), which is presumably why the append did not think to say it. It needs to be said.

**Required correction.** State explicitly that no queue write occurs inside the transaction, and that scheduling of the continuation is driven by a durable record written **inside** it and picked up by the outbox relay after COMMIT — or name whatever alternative is intended. Then extend R14·6 test 4's crash boundary to include the post-COMMIT/pre-schedule window.

**Condition, not a blocker.** Step 4 (via R14·4 step 2) locks the owner's budget row inside a transaction that already holds the outbox row and the follower attachment. Concurrent continuations for one owner will serialise on that budget row, and the spec states no canonical lock order. Declare the order (outbox → follower → budget) as binding so no other transaction can take them inversely, and record that owner-level budget locking is a deliberate throughput ceiling.

---

### Target R14·4 — Budget-refusal state and ordering
**Verdict: PASS**

**Evidence:** `0033` L3426–3460 (R14·4) · L1163–1174 (R8·3 closed state set) · L1175–1180 (reservation FK re-point) · L910–935 (R7·4/R7·5) · `packages/jobs/errors.ts:12,22` · `migrations/0001_schema.sql:54-55`.

The FK contradiction is real and is correctly resolved. Verified independently: R8·3's closed state set at L1171 is exactly `reserved | walking | accepted | exhausted | abandoned`, so R14·4's claim that no legal state represents pre-funding refusal is accurate, and adding terminal non-executable `budget_refused` is the minimal correct fix. Claim-on-insert of the routing attempt **directly** into its final state (rather than inserting-then-transitioning) is what makes "no committed `reserved` row without its held reservation" enforceable rather than aspirational.

I specifically tested whether step 3 reproduces the defect one table over — whether the reservation insert would itself require a `provider_operation_attempts` row that does not exist yet. **It does not:** R8·3 (L1177–1180) retracted R7·5's `provider_operation_attempt_id NOT NULL` in favour of nullable `accepted_provider_operation_attempt_id`. The ordering is satisfiable as written.

Consistency with shipped code checks out: `BUDGET_EXCEEDED` exists in the §4.3 taxonomy and is correctly non-retryable (`errors.ts:22`), and `failed` is a legal `jobs.status` (`0001_schema.sql:55`).

**Owner decision, flagged not decided.** A continuation refused for budget sets the job `failed/BUDGET_EXCEEDED` — but the *prior* operation on that job may already have been accepted and billed. The spec does not say whether that prior charge is retained on the ledger and surfaced to the owner. It is a product question, not a specification defect, and it is invisible until the first real refusal.

**Out-of-scope observation, recorded because it will collide with this design.** The shipped budget gate (`create.ts:90-95`) reads `SUM(jobs.cost_cents)` and the cap in two separate unlocked queries and then checks — and `cost_cents` is only written at terminal success (`worker.ts:69-71`), so **in-flight spend is invisible to the gate entirely**. R14·4's reservation model is the correct answer to that, but it currently exists only inside the removal lane while `createJob` remains unreserved for every job type. Not a Round-14 blocker; it should not be discovered later as a surprise.

---

### Target R14·5 — Per-candidate direct-billing transport
**Verdict: BLOCKED**

**Evidence:** `packages/providers/routing.ts:94-136` · `packages/jobs/worker.ts:23-28` · `0033` L3082–3103 (R13·4), L3462–3516 (R14·5), L1168 (`chain_snapshot`).

The diagnosis is correct and verified at source. `ChainFailure` (`routing.ts:95-100`) carries `connectionId`, `providerSlug`, `errorCode`, `error` and no charge dimension; `JobHandler` (`worker.ts:24-28`) returns exactly one `costCents` and one `providerId`. A billed candidate that fails before a later success is genuinely unrecoverable across that boundary. `ProviderChargeEvent[]` is the right transport and its fields are sufficient for the stated grain.

I checked whether `"frozen chain snapshot"` is another undefined identifier of the `$lease` class. **It is not** — `routing_attempts.chain_snapshot` is defined at L1168. But checking it surfaced the blocker.

**Blocker 1 — the ordinal's namespace silently changed, and it collides with the uniqueness constraint R14·5 preserves.**

- R13·4 (L3100–3101) defines `provider_attempt_no` as *"the ordinal of the candidate within **that execution attempt's** chain walk"*, under `UNIQUE (job_id, execution_attempt, provider_attempt_no) WHERE origin='direct'`, where `execution_attempt` is the claim-time frozen `jobs.attempt` (L2735).
- R14·5 (L3490) redefines it as *"0-based ordinal in the **frozen chain snapshot**"* — and `chain_snapshot` is a column on `routing_attempts`, not on the execution attempt.

These coincide only if exactly one `routing_attempts` row exists per `execution_attempt`. R14·2 and R14·3 mint a **new routing attempt per continuation**, and nothing in R14·3's transaction increments `jobs.attempt`. So one execution attempt can carry two routing attempts, each with a `chain_snapshot` whose ordinals start at 0 — and the second candidate-0 direct row **violates the unique index and cannot be inserted**. The dropped row is a real billed charge, which is the exact harm R14·5 exists to prevent.

**Required correction — choose one, explicitly:** (a) state that every continuation increments `execution_attempt`; or (b) add `routing_attempt_id` to the direct grain; or (c) define `provider_attempt_no` as monotonic across all routing attempts within one execution attempt, and say who allocates it. Silence resolves to a constraint violation in production, not to a default.

**Blocker 2 — the total-exhaustion path still discards the trail.** `walkChain` (`routing.ts:130-135`) throws `NO_PROVIDER` when every candidate fails and flattens `failures` into a formatted **string** in the error detail; the structured array is discarded at the throw. R14·5 requires the walker boundary to preserve ordinal and disposition, but only describes the handler *result* contract. On the all-candidates-failed path there is no result — and that is precisely the path where every candidate is a potential billed failure. **Required correction:** the exhaustion path must carry `chargeEvents` structurally (typed error payload or an out-parameter), and R14·6 needs a test for it.

**Condition.** `costCents?: number; // required iff chargeState === 'known'` states an invariant in a comment that the type does not enforce. Given this project's history with rules that live only in prose, make it a discriminated union on `chargeState` so the compiler rejects a `known` event with no cost.

---

### Target R14·6 — Test completeness
**Verdict: BLOCKED**

**Evidence:** `0033` L3518–3549 · cross-read against R14·1–R14·5 and the shipped seams.

The eight tests are well-aimed and tests 1, 2, 5, 7 and 8 would genuinely fail an implementation that got their targets wrong. Test 4's two-sided crash boundary is the right shape. But the set has three holes, each of which lets an invalid implementation pass:

1. **Test 3 does not test what it claims.** *"Two deliveries of that one wake produce one generation and one routing attempt"* is satisfied entirely by R14·3 step 1's outbox lock, regardless of whether the continuation key is derived correctly — a hard-coded or wrong key passes it. The property that actually needs pinning is **crash-and-retry determinism**: abort after the increment, retry, assert the recomputed key is byte-identical and no second attempt is minted. Add that case.
2. **No test covers the unfenced `jobs`-row writes from R14·1.** Required: a zombie worker whose replacement holds the job must fail both the graceful-release write (`runtime.ts:94-98`) and the terminal success write (`worker.ts:68-72`), with the replacement's row unchanged and the provider submission counter at 1.
3. **No test covers the total-exhaustion billing path from R14·5.** Test 6 asserts candidate 0 failed-billed + candidate 1 success — the path where a result exists. Required: **all** candidates fail with at least one `chargeState='known'`, and assert the billed rows survive the `NO_PROVIDER` throw.

Additionally, once R14·5's ordinal namespace is settled, test 6 should assert across a **continuation** (two routing attempts inside one execution attempt), since that is where the grain collides.

---

## 4. Overall verdict

**`REJECTED` — Round 14 does not clear independent review. Four targets blocked.**

Remaining blockers, exactly:

1. **R14·1** — the poll fence does not reach the two shipped `jobs`-row writes (`runtime.ts:94-98` graceful release; `worker.ts:68-72` terminal write). A zombie can reset or overwrite its replacement's live job, producing a second provider submission.
2. **R14·3** — the transaction's relationship to the queue is unstated; both available readings (enqueue inside vs. after COMMIT) break the crash-safety guarantee the correction exists to provide.
3. **R14·5(a)** — `provider_attempt_no` is redefined into the `chain_snapshot` namespace while `UNIQUE (job_id, execution_attempt, provider_attempt_no)` is retained; a continuation makes candidate 0 collide and drops a real billed row.
4. **R14·5(b)** — `walkChain`'s total-exhaustion path discards the structured failure trail into a string, so charge events are lost on the all-candidates-failed path.
5. **R14·6** — three missing tests (crash-retry key determinism; zombie job-row write rejection; exhaustion-path billing survival), each of which currently permits an invalid implementation to pass.

Non-blocking conditions to carry into the next round: timer-driven heartbeat is not a liveness signal (R14·1); canonical lock order and owner-level budget serialisation (R14·3); `ProviderChargeEvent` as a discriminated union on `chargeState` (R14·5); the shipped `createJob` budget gate is TOCTOU-racy and blind to in-flight spend (out of lane, will collide later); billed-then-refused continuation is an unanswered owner question (R14·4).

**R14·2 and R14·4 clear.** Both were tested against the specific defect class that would have sunk them and both survived.

## 5. Required statements

- **Source or tests changed:** none. No file in the repository was created, edited, or deleted by this review.
- **Tests run:** none. No `pnpm`/Vitest execution, no install, no migration. Every finding is from source reading, and each is cited to a file and line range so it can be checked without rerunning me.
- **Network / provider / key / spend:** none beyond `git clone` of this public repository. No `.env` read, no provider API call, no probe, no upload, no spend.
- **Blueprints:** untouched. VHE-2 §4.1/§4.2 not edited, `0034` not executed, `_regenerate.py` not run.
- **Prior verdicts:** none overwritten; this file is additive.

## 6. Recommended next gate

**Round 15 append to `0033` by an author other than this reviewer**, correcting the five blockers above. The two that change shape rather than wording — R14·1's fence scope and R14·5's ordinal namespace — should be settled first, because R14·6's missing tests cannot be written until they are.

`0034` stays **reserved and unexecuted**. The removal lane stays **not build-authorized**. Nothing in this review authorizes implementation, a provider probe, or spend.

— **Marcus Soren**, Claude AI, 2026-08-01
