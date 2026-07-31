# VHE Handoff — 2026-07-24-35 (round-7 correction filed; stopped for Eli's focused re-review)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — **Claude Opus 5** (owner switched model mid-session via `/model claude-opus-5`; see the model-version note in `AI-ACCOUNT-REGISTRY.md`) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" (the new room opened at the round-6 transfer) |
| **Session window** | 2026-07-24, ~14:54 EDT onward |
| **Project phase** | Removal-lane spec gate — **round-7 correction filed on `0033`**. Spec was **REJECTED** at round 7. Still NOT build-authorized. Stopped for Eli's focused re-review. |

---

**Blueprint sections followed:** VHE-2 §4 (worker/claim/error taxonomy/budget) · §7 (routing) · §9.5
(chunked repair) · §2 (schema) — **spec/correction only, no code written.**

## What happened this session

The room opened as Sonnet, read the log chain, and reported the gate state. Ashley then switched the
model to **Opus 5** and relayed **Eli's round-7 verdict on `VHE-Progress-update 09`: the specification is
REJECTED.** Six remaining blockers, plus a requirement to define exact parent/child resume behavior for
all seven job statuses. Instruction: append round-7 to `0033` **only** — do not rewrite `0032` or any
prior correction — update the logs/status, cut the next review ZIP, and stop.

**I verified all six blockers against the real code before writing a word of resolution. All six are
genuine defects in my own round-5/round-6 text.** Nothing was hand-waved as a reviewer misreading.

## The six blockers and where each was confirmed

| # | Blocker | Confirmed at | Nature of the defect |
|---|---|---|---|
| 1 | `awaiting_reconciliation` overwritten by the worker's automatic `succeeded` | `packages/jobs/worker.ts:66-73` | `executeClaimed` writes `status='succeeded', progress=1` with **no condition** after the handler returns. R6·3 told the handler to set `awaiting_reconciliation` and **return** — which is exactly what triggers the clobber. Result: a job with an unknown provider submission reports **succeeded**, reservation held forever, parent advances on a non-existent result. |
| 2 | Poll-only continuation cannot reclaim a freshly `running` job | `packages/jobs/worker.ts:35-45` | Verbatim claim requires `status='queued'` OR a 120s-stale heartbeat. A just-reconciled job is `running` with a fresh heartbeat ⇒ **0 rows ⇒ silently dropped** (permanent deadlock). `awaiting_reconciliation` isn't in the `IN` list at all, and `attempt=attempt+1` burns the retry ceiling at `:76`. |
| 3 | Chunk parents auto-rerun parked children | `packages/repair/chunked-repair.ts:123, 126-131, 174-182` | `ChildStatus` lacks `awaiting_reconciliation`; `firstNonSucceededWindow` treats **anything ≠ `succeeded`** as runnable; `executeChunkedRepairPlan` then calls `deps.run` on it ⇒ a child deliberately parked awaiting Ashley's overlap decision is **re-submitted and re-charged**. Directly contradicts R6·6. |
| 4 | Reservations released before fallback routing finishes | `packages/providers/routing.ts:115-136` + R6·5 | R6·5 released on `preaccept_rejected` — the one variant R5·5 lets fall through — so the release fires exactly as `walkChain` advances to a possibly costlier candidate, destroying R5·6's chain-max design and reopening the TOCTOU window it was chosen to close. |
| 5 | Reservations/costs not tied to individual attempts | R6·5 vs `create.ts:59-67`, `schema:104` | `budget_reservations` had no attempt ref ⇒ two `held` rows per operation are indistinguishable (wrong release, or orphaned hold shrinking the budget permanently). And reconcile **SET** `jobs.cost_cents` ⇒ with multiple billed attempts the earlier spend **vanishes from the live `SUM`**, so the cap stops being enforceable. |
| 6 | No DB-enforced uniqueness for rerun attempt keys / reservations | R5·4, R5·7, R6·6 | The promised "dedup to the existing attempt" was specified only as app-level SELECT-then-INSERT — TOCTOU. Two concurrent rerun clicks ⇒ **two paid submissions**, the exact failure this whole spec chain exists to prevent. |

## What round 7 specifies (all appended to `0033`, nothing rewritten)

- **R7·0** — baseline correction: real HEAD is **`cbc094e`**, not the `52e3277` rounds 5–6 cite; and the
  **Higgsfield addon docx decision is resolved** (that commit tracked it), so the "pending owner decision"
  note in `CURRENT-STATUS`/handoff 34/`0023` is obsolete.
- **R7·1** — discriminated `HandlerOutcome` (`completed` | `parked`), disposition-branching in
  `executeClaimed`, **guarded** terminal writes (`AND status='running'`, publish nothing on a lost race),
  widened `publishState` (also touches `queue/runtime.ts:39,51,69`).
- **R7·2** — additive resume claim that performs `awaiting_reconciliation → running` **itself** (removing
  the race rather than narrowing it), **no `attempt` increment**, provider-job-id assertion, and a
  persisted `resumeMode:'poll_only'` marker in `input` so that even the verbatim 120s stale-takeover path
  dispatches to a handler with no submit branch. The verbatim §4.2 claim is **not edited**.
- **R7·3** — `ChildStatus` gains `awaiting_reconciliation`; a disposition classifier replaces
  `!== 'succeeded'`; **`deps.run` may fire only on a `queued`/absent child**; plus the **exact seven-status
  parent/child resume table** Eli demanded (`succeeded`, `queued`, `running`, `awaiting_approval`,
  `awaiting_reconciliation`, `failed`, `canceled`) with restart safety derived from persisted status.
- **R7·4** — the reservation's lifetime is the **whole chain walk**: `preaccept_rejected` no longer
  touches it; released only on chain-exhausted-`NO_PROVIDER`, cancel, or confirmed-no-job; stays `held` on
  `accepted` and on `ambiguous`; plus a chain-snapshot invariant.
- **R7·5** — `budget_reservations.provider_operation_attempt_id` FK makes the **attempt** the reservation
  grain; cost is authoritative per attempt; **`jobs.cost_cents` becomes a derived rollup** (`SUM` over the
  job's attempts) so the real budget model at `create.ts:59-67`/`schema:104` needs **no** migration; parent
  `cost_cents` stays `0` so chunked repair can't double-count against the cap.
- **R7·6** — unique indexes on `attempt_key`, `(provider_operation_id, attempt_no)`, and
  `budget_reservations(provider_operation_attempt_id)` (full, not partial — a `released` row must still
  block re-reservation), with claim-on-insert `ON CONFLICT DO NOTHING` mirroring the project's proven
  `jobs.idempotency_key` pattern (`schema:64`, `create.ts:100-110`), plus a 6-step ordered spend-capable
  sequence.
- **Eight round-7 tests** added on top of `0032` §12 + §9's seven + round-5's seven + round-6's six.

**Tested — with actual results:** No tests run. **No source file was touched**, so there was nothing to
re-run. Suite/preflight remain **153/153 · preflight 13/4/1** as last measured at `52e3277`; the only
commit since (`cbc094e`) added one binary `.docx` and no code.

## Files created or changed

- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — **round-7 correction appended.** Body,
  round-5 and round-6 appends all untouched.
- `_LOGS/LOG-INDEX.md` — `0033` row updated with the round-7 summary + status. Next unused number is
  still `0034`.
- `_LOGS/AI-ACCOUNT-REGISTRY.md` — added the Opus-5 model-version note (no row modified or deleted).
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — overwritten to the round-7 state.
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-24-35_...md` — this handoff.
- `_LOGS/README.md` — Progress-update history extended with `10`.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-OPUS-01.md` — created at session start, deleted at close.
- `VHE Backups\VHE FOR Review\VHE-Progress-update 10_2026-07-24.zip` — created (metrics in
  `CURRENT-STATUS.md`, recorded on disk after packaging).
- **No `packages/`, `scripts/`, `migrations/` or any source touched. `0032` NOT rewritten. `0033`'s body
  and its round-5/round-6 appends NOT rewritten.**

## Unfinished / left mid-work

Nothing mid-work. Stopped deliberately at the review gate, as instructed.

## CARRY-OVER — FOR ELI (relay with `Progress-update 10`)

Round 7 is appended to `0033`. Please confirm against `10`:

1. Do the six round-7 resolutions clear the blockers, or do any remain?
2. Are these specific choices acceptable: (a) a **discriminated `HandlerOutcome`** with guarded terminal
   writes, rather than editing §4.2's verbatim claim; (b) a **separate additive resume claim** that itself
   performs `awaiting_reconciliation → running` plus a persisted `resumeMode:'poll_only'` marker to close
   the stale-takeover hole; (c) `deps.run` restricted to `queued`/absent children only, and the exact
   seven-status table as written; (d) reservation lifetime spanning the **entire chain walk** with
   `preaccept_rejected` no longer releasing; (e) **`jobs.cost_cents` as a derived attempt rollup** with the
   parent held at `0` — chosen specifically so the real `budgets` live-`SUM` model needs no migration;
   (f) **full** (not partial) uniqueness on `budget_reservations(provider_operation_attempt_id)`.
3. If it clears: **state the exact next gate.** If items remain: they get **appended to `0033`** as
   round 8 — do not rewrite `0032`, `0033`'s body, or any prior append.

## CARRY-OVER — FOR ASHLEY

1. **Zero-spend probe — still gated on you, in person.** Unchanged from handoff 34. Nothing was read,
   called, or spent this session.
2. **Identifier ruling wanted:** you're on **Opus 5** now but the registry's `CC-OPUS-01` row says
   "Opus 4.8". I signed `CC-OPUS-01` per START-HERE's explicit "Opus ⇒ `CC-OPUS-01`" mapping and noted the
   real model version in the entry. Say the word if you'd rather split it to `CC-OPUS-02`.
3. **`S3_REGION`** concrete value for the live fal `image.inpaint` validation (`0027`) — still
   outstanding, non-blocking.
4. **The 4 frozen §1 AI fixtures** (`bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`,
   `bad_hand_6s.mp4`) — still owed as files; the only Phase-0 exit-gate FAILs (`0009`/`0011`).
5. **Higgsfield docx — RESOLVED**, no longer a carry-over: commit `cbc094e` tracked it. Prior handoffs
   listing it as pending are stale.

## Blockers, warnings, dependencies

- **NOT authorized until Ashley says otherwise, in person:** fal zero-spend probe, reading the fal key,
  any provider call, any network access, any spend, any removal-lane code, any deploy.
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + round-5 + round-6 +
  round-7 appends (do NOT rewrite — takes further appended corrections).**
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1. Python `py -3.11`.
  Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.

## For deeper context, read these entries only

- `VHE-ISSUE-LOG-0033` — body + round-5 + round-6 + **round-7** appends (later appends govern on conflict).
- `VHE-ISSUE-LOG-0032` — the base spec `0033` binds over.
- `VHE-ISSUE-LOG-0028` §7a — the governing owner ruling.
