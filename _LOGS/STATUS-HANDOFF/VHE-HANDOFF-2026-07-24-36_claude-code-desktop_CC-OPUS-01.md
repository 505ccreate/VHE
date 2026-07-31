# VHE Handoff — 2026-07-24-36 (round-8 correction filed; stopped for Eli's focused re-review)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — **Claude Opus 5** (per the round-8 ruling: no `CC-OPUS-02` split; the existing registry row now records Opus 5 as the current model version) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-24, ~14:54 → ~16:1x EDT (rounds 7 **and** 8 in one session) |
| **Project phase** | Removal-lane spec gate — **round-8 correction filed on `0033`**. Spec **REJECTED** again at round 8. Still NOT build-authorized. Stopped for focused re-review. |

---

**Blueprint sections followed:** VHE-2 §4 (worker/claim/budget gate/error taxonomy) · §7 (routing) ·
§9.5 (chunked repair) · §2 (schema) — **spec/correction only, no code written.**

## What happened this session

This room handled **two full review rounds**. Handoff 35 covers round 7. After it was filed, Ashley
relayed **Eli's round-8 verdict on `VHE-Progress-update 10`** and then left for the day, instructing me
to do my best autonomously. This handoff covers round 8.

**Package audit: PASS.** Eli independently confirmed `10`'s 155 entries, 970,159 compressed bytes, SHA-256
`165E9B7473DFEF75999C3E96B30A9563D0BC7142B48F3F371FE30EACA34B2CBB`, ZIP integrity, no `.env`,
credential-free `.env.example`, zero backslash/duplicate/absolute/traversal/symlink paths, no
`_IN-PROGRESS` scratch, no `library/tools` leak, the eight stripped binaries correctly recorded in the
package-10 manifest, and rounds 5/6/7 intact.

**Verdict: specification REJECTED with six blockers.** I assessed all six against the real code. **All six
are correct, and four of them required me to explicitly retract round-7 text I had written.** Round 7 is
preserved above in `0033` exactly as filed; round 8 governs where they conflict.

## The six blockers — and the four round-7 retractions they forced

| # | Blocker | Verdict | Resolution |
|---|---|---|---|
| 1 | The `parked` write is unguarded | **Correct — my omission.** R7·1 guarded `succeeded`/`failed` but not the *new* write it introduced. A concurrent cancel could be overwritten back into `awaiting_reconciliation`, resurrecting a canceled job that holds a reservation forever | One uniform `WHERE id=$1 AND status='running' RETURNING id` for **all three** dispositions; publish only on exactly one row. Also **narrows** R7·1's `failed` guard from `IN ('running','queued')` — a `queued` row was never this worker's to fail |
| 2 | `resumeMode:'poll_only'` is sticky | **Correct — a real latent failure**, the mirror image of the bug R7·2 fixed. After reconcile → `awaiting_approval` → rerun, the stale marker makes the worker **poll the old provider job instead of submitting the new attempt** | **RETRACTED** the `jobs.input` marker. Execution mode + provider job id bind to the current attempt via `provider_operations.current_attempt_id` + `provider_operation_attempts.execution_mode`; one pointer write clears all prior poll-only state by construction. Takeover guarantee preserved and strengthened |
| 3 | A chain-wide reservation can't belong to a provider-specific attempt | **Correct — the genuine structural defect.** `provider_operations` is `(provider_connection_id, cache_key)`-scoped, so every attempt is provider-specific; but R7·5/R7·6 required reserving *before* the walk knows which candidate wins. Unimplementable as written | New provider-neutral **`routing_attempts`** table owns the reservation. `budget_reservations.routing_attempt_id` (UNIQUE, NOT NULL); the provider-attempt FK becomes **nullable** `accepted_provider_operation_attempt_id`, set after selection. Each candidate gets its own attempt FK'd back to the routing attempt |
| 4 | Cancel / post-acceptance failure can't auto-release | **Correct.** Once accepted, a cancel or provider-side failure does **not** prove $0 was charged. Releasing erases real spend | Release **only** on proven pre-acceptance rejection or confirmed-no-job. Accepted / ambiguous / failed-after-acceptance / canceled-after-acceptance all **reconcile** to actual (provider-reported → else `0024` catalog → else stay `held`). Parent sibling-cancel applies the same test per sibling |
| 5 | The monthly budget query loses cross-period rerun spend | **Correct — retracts my round-7 claim.** `periodSpendCents` (`create.ts:56-68`) filters on the **job's** `created_at`, so a January job's February rerun never counts against February; once reconciled it also leaves the `held` sum and vanishes entirely | R7·5's "budget model needs **no** migration" is **RETRACTED**. The reservation ledger keyed on its own `period_start` becomes authoritative, with a `NOT EXISTS` legacy fallback so no-reservation jobs count exactly once and dual jobs aren't double-counted. `jobs.cost_cents` demoted to a display rollup. `create.ts`'s gate must change for **all** job types — logged deviation + regression test required |
| 6 | A failed operation claim orphans a held reservation | **Correct.** R7·6's "claim returns zero rows → STOP" left the attempt and reservation already created, with no rollback defined | Steps 1–4 become **one DB-only transaction** (the submit stays **outside** it, so the `budgets FOR UPDATE` lock is never held across a network call) + explicit compensation for every post-commit exit + a **reaper** for the commit-then-crash window that applies the R8·4 test before releasing. Idempotency moves up to `routing_attempts(routing_attempt_key)` UNIQUE with claim-on-insert |

**Plus R8·7** — a generated `PACKAGE-PROVENANCE.md` now ships in each package, responding to Eli's note
that HEAD can't be authenticated from a ZIP lacking `.git`. It records `git rev-parse HEAD`, the commit
summary, `git status --short`, counts, and the inclusion rule. **Honest caveat, stated inside the file:
this is a build-time record, not cryptographic proof.**

**Eight round-8 tests** added, on top of `0032` §12 + §9's seven + round-5's seven + round-6's six +
round-7's eight.

**Tested — with actual results:** No tests run. **No source file was touched**, so there was nothing to
re-run. Suite/preflight remain **153/153 · preflight 13/4/1**, last measured at `52e3277`; no code has
changed since.

## Administrative rulings received and applied

- **Identifier:** continue signing `CC-OPUS-01`; record "Claude Opus 5" as the current model version in
  the **existing** registry row; **no `CC-OPUS-02` split.** Applied — the row is updated and round-7's
  open question is marked **CLOSED** in `AI-ACCOUNT-REGISTRY.md`.
- **Commit:** do not commit before the correction set is complete; make **one** docs-only commit after
  the logs/status/handoff are updated. Done — see below.
- **Next package:** cut `Progress-update 11` after the round-8 appendix, then stop. Done.

## Files created or changed

- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — **round-8 correction appended.** Body and the
  round-5/6/7 appends all untouched.
- `_LOGS/LOG-INDEX.md` — `0033` row extended with the round-8 summary. Next unused number is still `0034`.
- `_LOGS/AI-ACCOUNT-REGISTRY.md` — `CC-OPUS-01` row records Opus 5; the model-version note marked RESOLVED.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — overwritten to the round-8 state.
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-24-35_...md` — round-7 handoff (this session, earlier).
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-24-36_...md` — this handoff.
- `_LOGS/README.md` — Progress-update history extended with `10` and `11`; provenance-file rule recorded.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-OPUS-01.md` — created at session start, deleted at close.
- `VHE Backups\VHE FOR Review\VHE-Progress-update {10,11}_2026-07-24.zip` — created.
- **No `packages/`, `scripts/`, `migrations/` or any source touched. `0032` NOT rewritten. `0033`'s body
  and its round-5/6/7 appends NOT rewritten.**

## Unfinished / left mid-work

Nothing mid-work. Stopped deliberately at the review gate, as instructed.

## CARRY-OVER — FOR ELI (relay with `Progress-update 11`)

Round 8 is appended to `0033`, including four explicit retractions of round-7 text. Please confirm
against `11`:

1. Do the six round-8 resolutions clear the blockers, or do any remain?
2. Are these specific choices acceptable: (a) **`routing_attempts`** as the provider-neutral reservation
   owner, with `accepted_provider_operation_attempt_id` nullable until a candidate accepts; (b) execution
   mode + provider job id bound to `current_attempt_id` rather than any job-level flag; (c) the
   release-vs-reconcile table keyed on **whether acceptance was ever proven**, with unknown cost staying
   `held` (deliberately conservative — it keeps counting against the cap); (d) the reservation-ledger
   budget query **with the `NOT EXISTS` legacy fallback**, and demoting `jobs.cost_cents` to display —
   note this changes the shared §4.1 gate for **all** job types, not just this lane; (e) transaction +
   compensation + **reaper** as three distinct mechanisms rather than relying on the transaction alone.
3. If it clears: you stated the next gate is the **separately authorized zero-spend fal metadata probe,
   not implementation** — please confirm that still holds. If items remain: they get **appended to
   `0033`** as round 9; do not rewrite `0032`, `0033`'s body, or any prior append.

## CARRY-OVER — FOR ASHLEY

1. **Zero-spend probe — still gated on you, in person.** Nothing was read, called, or spent across
   either round this session. Eli has now stated that if round 8 clears, **the probe is the next gate** —
   so this is likely the decision waiting for you when you're back.
2. **Identifier question is closed** — Eli ruled: stay `CC-OPUS-01`, no split. Registry updated. Nothing
   needed from you unless you disagree.
3. **`S3_REGION`** concrete value for the live fal `image.inpaint` validation (`0027`) — still
   outstanding, non-blocking.
4. **The 4 frozen §1 AI fixtures** (`bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`,
   `bad_hand_6s.mp4`) — still owed as files; the only Phase-0 exit-gate FAILs (`0009`/`0011`).
5. **One docs-only commit** was made this session per Eli's instruction, covering the completed round-7 +
   round-8 correction set. No source code is in it.

## Blockers, warnings, dependencies

- **NOT authorized until Ashley says otherwise, in person:** fal zero-spend probe, reading the fal key,
  any provider call, any network access, any spend, any removal-lane code, any deploy.
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + rounds 5–8 appends
  (do NOT rewrite — takes further appended corrections).**
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1. Python `py -3.11`.
  Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.

## For deeper context, read these entries only

- `VHE-ISSUE-LOG-0033` — body + rounds 5, 6, 7, **8** (later appends govern on conflict).
- `VHE-ISSUE-LOG-0032` — the base spec `0033` binds over.
- `VHE-ISSUE-LOG-0028` §7a — the governing owner ruling.
