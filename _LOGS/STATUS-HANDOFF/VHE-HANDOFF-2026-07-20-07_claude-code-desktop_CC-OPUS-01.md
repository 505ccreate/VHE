# VHE Handoff — 2026-07-20-07

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` (Claude Opus 4.8) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-20 morning (EDT) |
| **Project phase** | §2–§6 core built; **§4 now fully closed incl. the production transport**. §7 still BLOCKED on §17 Q2 (provider ranking). |

---

**Blueprint sections followed:** VHE-2 §4.1, §4.2, §4.3.

## What happened to the "Eli question"

Handoff -06 required the new room's first action be to ask the owner whether Eli's answers were
ready. **Asked.** The owner replied that they were leaving for work, would **not** be available for
decisions, and delegated decisions to the builder. So **§17 Q2 (provider ranking) is still
unanswered** and §7 remains blocked. The session took branch 2 of -06's plan — the BullMQ transport.

**The Eli question is still open. The next room should ask it again.**

## Current working state

Repo on `master`, local only, **tree clean**. `pnpm test` → **21/21 passing** (17 inherited + 4 new),
run under fnm Node 22.23.1 against **live Redis + live Postgres**. `pnpm preflight` → **PASS 13 /
FAIL 4 / SKIP 1**, unchanged; the 4 FAILs are still only the undelivered owner AI fixtures.

## Completed this session — read `VHE-ISSUE-LOG-0017` for depth (it is the only new entry)

- **§4 production BullMQ transport built** — `packages/queue/{connection,queues,runtime}.ts` +
  `runtime.test.ts`. This closes the last remaining piece of §4 that `0015` left open.
  `packages/jobs/worker.ts` and `create.ts` are **unmodified**: the §4.2 body is *called*, not
  re-transcribed, and `create.ts`'s `deps.enqueue` seam from `0015` was filled from the outside with
  a zero-diff integration.
- **Found and fixed TWO blueprint defects that made §4's entire retry path silently dead.**
  Verbatim §4.1's add-options (`{ jobId }` alone) leave BullMQ at `attempts: 1`, so no retry ever
  fires and §4.2's `backoffStrategy` is dead config. Fixing that exposed a deeper one: the verbatim
  backoff is capped at 30s but the verbatim re-claim guard needs 120s of heartbeat staleness, so a
  retry can **never** win the re-claim — the handler ran once, **BullMQ reported `completed`, and the
  DB row stranded at `status='running'` forever.** Silent, permanent, and it looked green.
  Both ruled under the owner's delegation, both one-line reversible. — `VHE-ISSUE-LOG-0017` §3–§5

## Tested — actual results

- `node node_modules/vitest/vitest.mjs run --reporter=verbose` → **Test Files 5 passed, Tests 21
  passed.** `--reporter=verbose` was used deliberately to confirm the 4 new live tests genuinely ran
  rather than self-skipping (real network durations 2242 / 3704 / 6870 / 337 ms).
- New coverage: full enqueue→claim→execute→succeed path; retryable error retries and recovers
  (`runs=2`, `attempt=2`, billed once); permanently-failing job exhausts to `failed` with
  `error_code='PROVIDER_TIMEOUT'` (`runs=3`, not stranded); BullMQ jobId dedupe.
- `pnpm preflight` → PASS 13 / FAIL 4 / SKIP 1 (unchanged).

## 🟡 Owner review requested (blocks nothing)

`VHE-ISSUE-LOG-0017` §5 — two rulings deviate from verbatim §4.1/§4.2 and were enacted under the
owner's in-chat delegation, not a ruling on the defect itself. Precedent (`0013`, §6.1) is that the
owner rules on blueprint defects, so both are flagged:
1. `attempts: 3` + `backoff: {type:'custom'}` added to §4.1's add-options (`queues.ts`).
2. Release the row to `queued` on §4.2's graceful-handback rethrow (`runtime.ts`).

Each is pinned by a test that turns red if reverted. Overruling either touches only those two files —
no verbatim blueprint code moves either way.

## 🔴 What blocks the next section (OWNER DECISION — unchanged)

1. **§17 Q2 — provider ranking** (`VHE-ISSUE-LOG-0003`). Still the wall in front of **§7**, which
   gates §8/§9/§10. **Ask the owner the Eli question again.**
2. **Deliver the 4 AI-content fixtures** → append sha256 → preflight exit 0.
3. `VHE-ISSUE-LOG-0007` (production worker topology) is **still open and was deliberately not
   resolved** — see `0017` §8. This session wrote transport code, not deployment config;
   `startWorker()` hands the Worker's lifetime to the caller precisely so *where it runs* stays open.

## Next recommended action (new room)

1. Read `CURRENT-STATUS.md`, then this handoff. For depth read **only** `VHE-ISSUE-LOG-0017`.
2. **Ask the owner the Eli question again** (provider ranking + the 4 test files).
3. With the ranking → build **§7** (BYOK adapters, AES-256-GCM key storage per the
   `provider_connections` schema, capability routing). It also supplies the real
   `estimateCostCents`, which drops into `createJob`'s existing seam with no §4 change.
4. Without it → the easy no-owner increments left are thin. Candidates, in order: §14 realtime
   events (`publishProgress`/`publishState` are no-op seams in `runtime.ts` waiting to be filled),
   or a process entry point for `startWorker` — but note that entry point starts colliding with the
   open `0007` hosting question, so keep it host-agnostic.
5. §6.4 splice golden tests remain deferred to §9. — `0013`

## Notes / gotchas (all still true, plus one new)

- **`npx` is NOT on the tool-shell PATH.** Run vitest as
  `fnm.exe exec --using 22.23.1 -- node node_modules/vitest/vitest.mjs run`. (New this session.)
- **Copy verbatim code from the .docx `word/document.xml`, not the `_BLUEPRINTS-TEXT/` mirror**, and
  apply the three-class de-corruption (`0012`, `0013`, `0016`). The §4.2 region was checked and is
  clean. Now also: **check numeric constants across subsections against each other** — `0017`'s
  defect B was a 30s cap in one block contradicting a 120s window in another.
- 🚨 System FFmpeg **8.1.2** on PATH — never bare `ffmpeg`; the §6 wrapper refuses rather than falls back.
- Windows ESM: dynamic import of an absolute path needs `pathToFileURL` (`0012` §7) — this bit again.
- Python always `py -3.11`. Never recursively scan `library/tools/`.
- vitest is scoped by `vitest.config.ts` to `packages/`+`scripts/` — do not remove it (`0013`).
- Multi-line git messages: `git commit -F <file>`; PS here-strings mangled one (`-06`).

**Read only these for depth:** `VHE-ISSUE-LOG-0017` (this session). `0015` for the §4 lifecycle it
completes. `0003` for the §17 Q2 ranking that gates §7. `0007` for production worker topology.
