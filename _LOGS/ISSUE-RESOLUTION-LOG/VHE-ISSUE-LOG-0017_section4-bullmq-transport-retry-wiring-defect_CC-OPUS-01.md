# VHE-ISSUE-LOG-0017  —  §4 production BullMQ transport built; TWO blueprint defects make §4's retry path silently dead — both ruled under owner delegation

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0017 |
| **Date / time** | 2026-07-20 (EDT, morning) |
| **Logged by** | `CC-OPUS-01` (Claude Opus 4.8) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §4.1, §4.2, §4.3 |
| **Category** | Build / Blueprint defect / Delegated decision |
| **Status** | **RESOLVED** (built + verified live) — but **§5 contains two rulings the owner should review**, because both deviate from verbatim §4.1/§4.2 |

---

## 1. What happened

The owner left for work at session start, stated they would be unavailable for decisions, and
delegated decisions to the builder. Eli's answers to §17 Q2 (provider ranking) were therefore **not**
available, so §7 stayed blocked and this session built the increment CURRENT-STATUS and handoff -06
both name as needing neither pending answer: the **production BullMQ transport** — the wiring that
delivers `{ jobId }` from a real queue into the already-verified `claimForExecution` /
`executeClaimed` path.

Built (all new, nothing existing modified):

- `packages/queue/connection.ts` — shared ioredis client for BullMQ.
- `packages/queue/queues.ts` — one `Queue` per `JobType`; the real `enqueue` implementing §4.1's
  `queues[type].add(type, { jobId }, { jobId })`.
- `packages/queue/runtime.ts` — the §4.2 `new Worker(...)` construction with the verbatim options.
- `packages/queue/runtime.test.ts` — 4 end-to-end tests against **live Redis + live Postgres**.

Writing a **falsifiable test for the first ruling** then exposed a second, much more serious defect
that reasoning alone had missed. That is the substance of this entry.

## 2. Why it matters

§4 is "the critical rule the whole system hangs on." Its retry semantics (§4.3's retryable column,
§4.2's `throw e // let BullMQ retry with backoff`) are how every future provider call in §7–§10
survives a 429 or a timeout. Copied 100% verbatim, **that entire mechanism does not run**, and it
fails in the worst possible way: the queue reports success while the database row is stranded
forever. Every section built on top of §4 would have inherited it invisibly.

## 3. Defect A — the verbatim §4.1 add-options make retries impossible

§4.1's verbatim enqueue (from `word/document.xml` para 179, not the lossy mirror) is:

```
await queues[type].add(type, { jobId }, { jobId }); // BullMQ jobId dedupe = second safety net
```

The job options are `{ jobId }` alone. BullMQ v5 defaults a job to `attempts: 1`, and only consults
a custom `backoffStrategy` when the job carries `backoff: { type: 'custom' }`. So verbatim:

- a retryable error is **never retried**;
- the verbatim `settings: { backoffStrategy: (a) => Math.min(30_000, 1000 * 2 ** a) }` in §4.2's
  Worker options is **never called** — dead configuration;
- §4.3's entire retryable / non-retryable distinction is **dead**;
- §4.2's `throw e` escapes with no terminal DB write, stranding the row.

The blueprint's own stated behavior is unreachable from its own code — the **same defect class as
the §6.1 one in `VHE-ISSUE-LOG-0013`**, which the owner ruled on.

**RULING A (delegated):** `packages/queue/queues.ts` exports `RETRY_POLICY = { attempts: 3, backoff:
{ type: 'custom' } }`, spread into the add-options. `attempts: 3` is **not invented** — it is the
number §4.2's own guard (`row.attempt < 3`) tests against. Revert = delete `RETRY_POLICY` from the
spread in `enqueue`.

## 4. Defect B — the retry can never win the re-claim (found by testing ruling A)

With ruling A in place the retry **is** scheduled — and still nothing works. The
`VHE-ISSUE-LOG-0017 ruling` test timed out. A throwaway diagnostic against the live services proved
the mechanism rather than guessing at it:

```
t~1000ms  DB status=running attempt=1 hb_age=1.0s  handlerRuns=1  bull={"delayed":1}
t~3000ms  DB status=running attempt=1 hb_age=4.1s  handlerRuns=1  bull={"completed":1}
t~15000ms DB status=running attempt=1 hb_age=13.3s handlerRuns=1  bull={"completed":1}
```

Read that carefully:

1. `delayed: 1` — ruling A works; the backoff retry was scheduled.
2. The retry was delivered ~2s later. `claimForExecution` **rejected** it: the row is `status
   ='running'` with a ~2-second-old heartbeat, and the re-claim guard admits only
   `status='queued' OR heartbeat_at < now() - interval '120 seconds'`.
3. The processor took the §4.2 "stale duplicate delivery — drop silently" path and returned.
4. **BullMQ marked the attempt `completed`.** The handler ran exactly once. The DB row is stranded
   at `status='running'`, `attempt=1`, **permanently**.

**Root cause:** the verbatim backoff is capped at `Math.min(30_000, …)` — 30 seconds — which is
strictly less than the verbatim 120-second takeover window. A retry therefore *always* arrives
inside the window that rejects it. No backoff value the verbatim strategy can produce is ≥ 120s, so
**no retry can ever be claimed.** The queue reports success; the row never reaches a terminal state.

**RULING B (delegated):** on the §4.2 graceful-handback rethrow, **release the row** —
`UPDATE jobs SET status='queued', heartbeat_at=NULL … WHERE id=$1 AND status='running'` — so the
retry can re-claim it, then rethrow to BullMQ.

Rationale: the 120s heartbeat takeover exists for **crashed** workers, which cannot reset anything.
A worker that is alive and *choosing* to retry can and must release explicitly. These are two
different paths and only the crash path should depend on the timeout. The `AND status='running'`
guard makes the release incapable of disturbing a row that already reached a terminal state.

**Placement is deliberate:** ruling B lives in `packages/queue/runtime.ts` — the BUILDER-owned
transport — **not** in the verbatim §4.2 body in `packages/jobs/worker.ts`, which is untouched.

## 5. 🟡 What the owner should review

Both rulings deviate from verbatim §4.1/§4.2 and were enacted under the owner's in-chat delegation
("I won't be here to help you with any decisions… I'm gonna trust you to make your own decisions"),
not under a specific ruling on this defect. Precedent (`0013`, §6.1) is that the **owner** rules on
blueprint defects. Flagged for confirmation:

1. **Ruling A** — `attempts: 3` + `backoff: {type:'custom'}` added to §4.1's add-options.
2. **Ruling B** — release-to-`queued` on graceful handback, in the transport layer.

Both are one-line reversible and each is pinned by a test that turns red on revert. If the owner
prefers a different resolution (e.g. raising the backoff above 120s instead of releasing), only
`runtime.ts` and `queues.ts` change — no verbatim blueprint code moves either way.

## 6. Verification (actually run)

Command: `fnm exec --using 22.23.1 -- node node_modules/vitest/vitest.mjs run --reporter=verbose`
(`npx` is not on the tool-shell PATH — see §7).

**Full suite: `Test Files 5 passed (5)`, `Tests 21 passed (21)`** — 17 inherited + 4 new. The 4 new
tests hit live Redis **and** live Postgres; `--reporter=verbose` was used specifically to confirm
they genuinely ran rather than self-skipping (real network durations: 2242 / 3704 / 6870 / 337 ms):

- `createJob → real enqueue → Worker claims and runs it → row reaches succeeded` — full transport
  path; `attempt=1`, `cost_cents=7` billed through `executeClaimed`, `progress=1`, output persisted.
- `a retryable §4.3 error IS retried with backoff and can succeed` — **the falsifiable test for both
  rulings**: `runs=2`, `status='succeeded'`, `attempt=2`, billed once. Red before ruling B.
- `a permanently-failing retryable job exhausts its attempts and lands on failed (never stranded)` —
  `runs=3`, `status='failed'`, `attempt=3`, `error_code='PROVIDER_TIMEOUT'`. Confirms ruling B did
  not create an infinite retry and that §4.2's ceiling still terminates the job.
- `BullMQ jobId dedupe` — same jobId added twice → 1 job (§4.1's "second safety net").

`pnpm preflight` re-run after the change: **PASS 13 / FAIL 4 / SKIP 1** — unchanged; the 4 FAILs are
still only the undelivered owner AI fixtures (`VHE-ISSUE-LOG-0009`).

Test rows are deleted and the queues obliterated in `afterAll`; the suite self-skips green when
`DATABASE_URL` or `REDIS_URL` is absent, matching `create.test.ts`.

## 7. Affected files / components / tests / commits

- **New:** `packages/queue/connection.ts`, `packages/queue/queues.ts`, `packages/queue/runtime.ts`,
  `packages/queue/runtime.test.ts`.
- **Unmodified on purpose:** `packages/jobs/worker.ts` (verbatim §4.2 body — called, not
  re-transcribed, so exactly one copy of the logic exists in the repo) and `packages/jobs/create.ts`
  (its `deps.enqueue` seam from `0015` §3 is filled from the outside, exactly as that entry
  intended — the inject-don't-invent pattern paid off with a zero-diff integration).
- Consumes: migration 0001's `jobs` table; the live Redis from `0011`.
- **Not touched:** any deployment config. See §8 on `0007`.

## 8. Scope boundary — this does NOT resolve `VHE-ISSUE-LOG-0007`

`0015` §6 closed by saying the production transport was "deliberately out of scope until the
deployment target is chosen," tracked with `0007`. That is **not** contradicted here, because the two
questions separate cleanly:

- **`0007` defers where a worker process RUNS in production** — a hosting decision, still open, still
  owner-only. Untouched by this entry.
- **The transport code itself** — a `Queue`, an `enqueue`, and a `Worker` binding — is VHE-2
  §4.1/§4.2 local application code that selects no host and writes no deployment config.

`startWorker()` returns the `Worker` and makes its lifetime the caller's problem precisely so that
*where* it is hosted stays an open question. Whoever answers `0007` will write the process entry
point that calls `startWorker`; nothing here pre-empts that choice.

## 9. Prevention

- **A ruling is not verified until a test fails without it.** Ruling A looked obviously correct and
  was still insufficient — defect B was invisible to reasoning and surfaced only because the test
  asserted the *observable outcome* (row reaches `succeeded`) instead of the mechanism (a retry was
  scheduled). Assert the outcome the blueprint promises, never the plumbing.
- **Two verbatim constants from different subsections can contradict each other.** `0013` and `0016`
  found defects inside a single code block; this one is a defect *between* blocks — a 30s backoff cap
  in §4.2's options versus a 120s takeover window in §4.2's body. When transcribing verbatim, check
  the numeric constants against each other, not just the syntax.
- **Silent success is the failure mode to hunt for.** The pre-fix system was green everywhere: tests
  passed, BullMQ reported `completed`, no error was raised anywhere. Only a direct query of the row's
  terminal state exposed it. For any job system, assert the DB reached a terminal state — never infer
  it from the queue's own report.
- `npx` is not on the tool-shell PATH; run vitest as
  `fnm.exe exec --using 22.23.1 -- node node_modules/vitest/vitest.mjs run`.
- The Windows-ESM `pathToFileURL` trap from `0012` §7 bit again in a throwaway script. It is real and
  recurring; the note in CURRENT-STATUS earned its place.

## 10. Related entries

- `VHE-ISSUE-LOG-0015` — §4 lifecycle; its `deps.enqueue` seam is what this fills. Its closing "only
  the production BullMQ transport remains" is now done; see §8 for the part still deferred.
- `VHE-ISSUE-LOG-0013` — the §6.1 blueprint-defect precedent (owner-ruled) this follows.
- `VHE-ISSUE-LOG-0007` — production worker topology; still open, deliberately not resolved here.
- `VHE-ISSUE-LOG-0012` — migration 0001 (the `jobs` table) + the `pathToFileURL` trap.
- `VHE-ISSUE-LOG-0003` — §17 Q2 provider ranking; still the wall in front of §7.

---

## Appended corrections

_(none)_
