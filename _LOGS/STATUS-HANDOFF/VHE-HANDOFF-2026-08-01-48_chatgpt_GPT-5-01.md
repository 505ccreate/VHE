# VHE Handoff — 2026-08-01-48

| Field | Value |
|---|---|
| **Logged by** | Eli Soren (`GPT-5-01`) |
| **Platform / room** | ChatGPT / GitHub build lane |
| **Work block** | Marcus REVIEW-001 intake, verification, and Round-15 correction |
| **Current gate** | Round 15 requires independent `REVIEW-002`; removal-lane implementation remains unauthorized |

## Owner instruction and crash-recovery discipline

Ashley restated the mandatory sequence because her computer and Brave browser have recently frozen/crashed:

1. write the intent log before touching the task;
2. checkpoint while working;
3. write completion/handoff/status logs after the task;
4. write a fresh intent before beginning the next task.

This work block followed that order. The live intent/checkpoint file existed before Marcus’s package was
opened or acted upon.

## Marcus package intake

Ashley supplied `MARCUS RESPONSE V01 -8-1-2026.zip`. It contained:

- `VHE-INTENT-2026-08-01-02_claude-ai_MARCUS-SOREN.md`
- `VERDICT-REVIEW-001_2026-08-01_MARCUS-SOREN.md`

The original files were imported byte-for-byte after hash verification:

- verdict SHA-256:
  `b35e6dfc85421b7d1055b0fbd27c8800b7f9017bfea588291132b2dcf1c13124`
- intent SHA-256:
  `11c21574d5e334979e31aeaa428e266c57e4757609cef99aab1acb768e15179e`
- import commit: `8c7fe32534d87bbb9d0db959f714fcc199f51a85`

They now live at:

- `_LOGS/AI-REVIEW-JOBS/VERDICT-REVIEW-001_2026-08-01_MARCUS-SOREN.md`
- `_LOGS/SESSION-INTENT/VHE-INTENT-2026-08-01-02_claude-ai_MARCUS-SOREN.md`

No Marcus identifier was invented. His owner-recognized display signature was preserved. His claude.ai
account still needs an owner-confirmed registry identifier before future registry-bound work.

## REVIEW-001 result

Marcus independently reviewed the Round-14 state at commit
`f82cd31cf900307a6ea5c8f4c396f558b4aab724`.

**Verdict: REJECTED.** He cleared R14·2 and R14·4, then identified five remaining blockers:

1. the provider poll lease did not fence the worker’s own heartbeat, retry-release, terminal, or other
   `jobs` writes against a replacement claim attempt;
2. the continuation transaction did not provide a durable Postgres-to-BullMQ execution handoff across the
   COMMIT/Redis boundary;
3. candidate ordinals could collide when multiple routing attempts executed under one frozen
   `jobs.attempt`;
4. total chain exhaustion could flatten structured billing facts into a string-only `NO_PROVIDER` error;
5. the test list omitted the corresponding zombie-write, crash-retry, and exhausted-chain regressions.

Eli Soren re-read the authoritative Round-14 append and shipped `worker.ts`, `runtime.ts`, and `routing.ts`.
All five blockers reproduce. R14·2 and R14·4 remain accepted.

## Round 15 appended

Round 15 was appended to `VHE-ISSUE-LOG-0033` at commit
`a08f02d1561b43d76c9a1d23fce0f61be5db3371`.

The append workflow verified:

- the exact pre-append Round-14 blob SHA;
- the Round-15 payload SHA-256;
- the complete prior file remained an exact byte-prefix;
- exactly **214 lines** were appended;
- no earlier body/append was rewritten.

Round 15 binds:

1. **Claim-attempt job fencing:** every worker-owned `jobs` write and downstream state publication is
   guarded by the frozen claim-time attempt; losing authority aborts provider side effects.
2. **Separate execution outbox:** funded continuations commit a Postgres `job_execution_outbox` row; a
   relay handles Redis/BullMQ after COMMIT. `execute` remains separate from continuation wakes.
3. **Fresh execution attempt per routed continuation:** the continuation returns to `queued`; the normal §4
   claim increments `jobs.attempt` and atomically binds the routing attempt to that execution attempt.
4. **Structured billing through exhaustion:** success and typed `NO_PROVIDER` failure both retain the full
   discriminated `ProviderChargeEvent[]`; billed/unknown events cannot disappear into a string.
5. **Ten additive tests:** zombie writes/side effects, three outbox crash windows, refusal, continuation-key
   crash determinism, ordinal reuse across fresh attempts, atomic routing bind, exhaustion billing, type
   safety, and canonical lock order.

## AI review queue

- `REVIEW-001` is closed as rejected and archived in
  `_LOGS/AI-REVIEW-JOBS/CLOSED-REVIEW-001_ROUND-14-REMOVAL-LANE-SPEC.md`.
- `REVIEW-002` is active at
  `_LOGS/AI-REVIEW-JOBS/ACTIVE-REVIEW-002_ROUND-15-REMOVAL-LANE-SPEC.md`.
- Eli Soren authored Round 15 and cannot independently clear it.

## Verification and changes actually made

Changed documentation/logging/specification only:

- imported Marcus’s two original Markdown files;
- appended Round 15 to `0033`;
- closed REVIEW-001 and opened REVIEW-002;
- updated the permanent log index/current status/handoff bookkeeping.

**No tests were run.** No source, test implementation, migration, package dependency, provider
configuration, or blueprint was changed. No provider key was read. No provider API, probe, upload, network
operation, or spend occurred.

## Current gate and prohibitions

`0032` + `0033` through Round 15 remain the removal-lane specification.

**STILL NOT BUILD-AUTHORIZED.** The next gate is independent `REVIEW-002`, not implementation and not a
provider probe.

`0034` remains reserved and unexecuted:

- do not modify VHE-2 §4.1/§4.2;
- do not run `_BLUEPRINTS-TEXT/_regenerate.py`;
- do not implement the removal lane;
- do not read provider keys, call providers, upload provider media, or spend money.

## Reading order for the next builder/reviewer

1. `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md`
2. this handoff
3. `_LOGS/AI-REVIEW-JOBS/README.md`
4. `_LOGS/AI-REVIEW-JOBS/ACTIVE-REVIEW-002_ROUND-15-REMOVAL-LANE-SPEC.md`
5. Marcus’s `VERDICT-REVIEW-001_2026-08-01_MARCUS-SOREN.md`
6. the Round-15 tail of `VHE-ISSUE-LOG-0033`
7. only the earlier `0033`/`0032` text and shipped source seams named by REVIEW-002

— **Eli Soren (`GPT-5-01`)**, 2026-08-01.
