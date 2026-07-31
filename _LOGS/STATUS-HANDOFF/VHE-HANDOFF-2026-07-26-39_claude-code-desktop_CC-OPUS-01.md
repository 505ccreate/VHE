# VHE Handoff — 2026-07-26-39 (round-10 correction appended to `0033`)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — **Claude Opus 5** (Opus family signs `CC-OPUS-01` regardless of version; no `CC-OPUS-02`) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-26, ~22:28 → ~23:5x EDT (same room as handoff 38; this is the second work block) |
| **Project phase** | Removal-lane spec gate — **round 10 filed on `0033`.** Spec REJECTED at round 10. Still NOT build-authorized. |

---

**Blueprint sections followed:** VHE-2 §4 (worker/claim/heartbeat/budget gate) · §4.1/§4.2 transport ·
§7 (routing) · §9.5 (chunked repair) · §2 (schema) — **spec/correction only, no code written.**

## What this session did

Ashley relayed Eli's **round-10 verdict** on `VHE-Progress-update 12`. **Package audit PASS.
Specification REJECTED — 4 blockers plus 1 documentation correction.**

**Order of operations, as instructed:** the docs-only commit came **first** (`2c7b944` — the round-9
relay, handoff 38, and the previous CURRENT-STATUS update), **before** any round-10 work began. Then the
round-10 correction was appended to `0033`.

**All four blockers are correct.** Verified against real code before writing a single line of the
correction — the discipline START-HERE records rounds 8 and 9 as having broken:

| # | Blocker | Verified against |
|---|---|---|
| 1 | **`submitting` is not pollable and must not be treated like `in_flight`** — R9·1's table said "poll the recorded `provider_job_id`" for both, but R9·2 captures that id only at `accepted`/`in_flight`. There may be nothing to poll | R9·1 vs R9·2 in `0033` — a contradiction between two of my own round-9 sections |
| 2 | **Cross-job attachment is unrepresentable** — R9·1 permits Job B to attach to Job A's operation; R9·3's composite FKs require every binding to be same-job. The follower cannot legally record what it attached to | R9·1 vs R9·3 — same class of internal contradiction |
| 3 | **Deleting the budget fallback drops non-routed spend** | `worker.ts:68-72` (universal §4.2 terminal-success write, every job type, no routing attempt) · `create.ts:56-68` (today's only spend reader) · `migrations/0001_schema.sql:104` (the blueprint's own `SUM(jobs.cost_cents)` model) |
| 4 | **A Postgres write and a BullMQ enqueue cannot share a transaction** | `packages/queue/connection.ts:40-52` (ioredis) · `packages/queue/queues.ts:71-72` (`new Queue(type, { connection })`) — two stores; the atomicity R9·5 promised does not exist |

**Blocker 3 is broader than Eli framed it.** He described it as future spend-capable jobs. Verified in the
tree, it also covers the **already-built** §9.1 OpenAI and §9.2 fal `image.inpaint` content-replacement
lane, which bills through `worker.ts:68-72` with no routing attempt — all of it would have vanished from
the monthly cap the moment the R9·4 migration ran. Stated that way in the append.

**Two consequences filed that Eli did not name**, found by re-reading my own appends for conflicts:
1. R9·1's claim-miss table never listed the **`prepared`** state R9·2 introduced — the first state in the
   submission boundary was undefined for an attaching worker. Now specified (live → wait; stale → reaper
   abandons + releases, waiter re-evaluates).
2. R9·1 **released** the attaching job's reservation, so a follower woken by a **`failed`** operation holds
   no reservation and **must re-acquire one before any paid attempt** — failing on the cap rather than
   proceeding unfunded. Now a binding rule.

**Documentation correction (R10·0):** my round-9 summary claimed "six composite FKs." Enumerated R9·3's
list — it defines **five composite FKs plus one single-column FK** (`job_execution_bindings.job_id →
jobs(id)`, the likely source of the miscount). No sixth constraint was intended or omitted. The same error
propagated into handoff 37 and `RELAY-TO-ELI_round-9_2026-07-26.md`; both are historical records and are
left as filed, corrected in `CURRENT-STATUS.md` and in the append.

## OPEN DECISION raised for Ashley — flagged, not decided

R10·3 requires the `origin='direct'` ledger row to be written **in the same transaction as the terminal
`jobs` write at `worker.ts:68-72`** — which is transcribed **verbatim** from VHE-2 §4.2, where §0 permits
adapting only `// BUILDER:` lines. **I did not choose.** Options: (i) additive statement inside the §4.2
transaction under a `// BUILDER:` note; (ii) wrap the §4.2 write in a caller-supplied transaction so the
insert lives outside the verbatim block; (iii) authorized amendment to VHE-2 §4.2. Round 10 specifies the
*requirement*, not the *edit site*.

**Also named but deliberately NOT fixed (no scope growth):** direct-spend jobs hold no reservation while
running, so concurrent one-shot jobs can overshoot the cap between the §4.1 pre-check and the terminal
write. That is **existing** §4.1/§2 behavior, not introduced by round 10.

## Tested — with actual results

**No tests were run. No source file was touched**, so there was nothing to re-run. Suite/preflight remain
**153/153 (17 files) · preflight PASS 13 / FAIL 4 / SKIP 1**, last measured at `52e3277`; every commit
since has touched only `_LOGS/` and one binary `.docx`.

**Append-only verified mechanically:** `git diff --stat` on `0033` reported **315 insertions, 0
deletions** (1706 → 2021 lines). `0032`, `0033`'s body, and rounds 5–9 are untouched.

## Files created or changed

- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — **round 10 appended** (R10·0 through R10·4 +
  10 new tests). Body and rounds 5–9 unmodified.
- `_LOGS/LOG-INDEX.md` — `0033` row extended with round 10; status column and date updated. **Next unused
  number is still `0034`.**
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — rewritten to the round-10 state, including the R10·0 FK-count
  correction and the OPEN DECISION.
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-26-39_...md` — this handoff.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-OPUS-01.md` — created at the start of this work block, deleted at
  the end.
- Earlier in the session (committed at `2c7b944`, before round-10 work): the round-9 relay, handoff 38, and
  the previous CURRENT-STATUS update.
- **No `packages/`, `scripts/`, `migrations/`, or blueprint file was touched. `0032` NOT rewritten.
  `0033`'s body and rounds 5–9 NOT rewritten. No R9·3 foreign key weakened.**

## Not done — deliberately

- **`Progress-update 13` NOT cut.** Eli's instruction was to append round 10, make the docs-only commit,
  and stop; he did not ask for a package. One will almost certainly be needed for the round-10 re-review —
  **it waits on Ashley's word rather than being built uninstructed.**
- **Full backup `v09` NOT cut** — Eli explicitly said it is not needed yet.
- Nothing probed, keyed, networked, uploaded, implemented, or spent.

## Unfinished / left mid-work

Nothing. Round 10 is fully filed. The room is idle at the spec-review gate.

## CARRY-OVER — FOR ASHLEY

1. **The OPEN DECISION above** — the VHE-2 §4.2 verbatim-boundary question. This is the only thing round
   10 leaves genuinely undecided, and it is yours to call.
2. **Say the word on `Progress-update 13`** for the round-10 re-review.
3. **`S3_REGION`** concrete value for the live fal `image.inpaint` validation (`0027`) — outstanding,
   non-blocking.
4. **The 4 frozen §1 AI fixtures** (`bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`,
   `bad_hand_6s.mp4`) — still owed as files; the only Phase-0 exit-gate FAILs (`0009`/`0011`).

## CARRY-OVER — FOR ELI (relay with `Progress-update 13`)

1. Do the four round-10 resolutions clear the blockers?
2. Specifically: (a) the **split claim-miss table** — only `in_flight` polls, live `submitting` waits on
   the owner's lease, stale `submitting` → `submission_unknown` + parked with the reservation `held`, and
   the newly-added **`prepared`** rows; (b) **`provider_operation_followers`** as the cross-job attachment
   mechanism, with `job_execution_bindings` left same-job and unweakened; (c) the rule that a follower
   woken by a **failed** operation must **re-acquire** a reservation and may fail on the cap; (d)
   **`origin='direct'`** as the third ledger origin with `UNIQUE (job_id) WHERE origin='direct'`, and the
   invariant that every cent in `jobs.cost_cents` appears exactly once as a reconciled ledger row; (e) the
   **`job_wakeup_outbox`** + dispatcher + retained sweeper, and the effectively-once chain (outbox ∧
   BullMQ `{jobId}` dedupe ∧ guarded single-winner claim); (f) **`job_parent_blocks`** as the durable home
   for `blocking_child_job_id`, with the composite FK to `jobs (id, parent_job_id)`.
3. **A view is invited on the OPEN DECISION** (the §4.2 verbatim boundary) — but Ashley decides it.
4. **Is the pre-existing non-routed cap-overshoot gap** (direct-spend jobs hold no reservation while
   running) something you want addressed in a later round, or left as existing §4.1/§2 behavior? Round 10
   named it and deliberately did not fix it.
5. If items remain: they get **appended to `0033`** as round 11; do not rewrite `0032`, `0033`'s body, or
   rounds 5–10.

## Blockers, warnings, dependencies

- **NOT authorized until Ashley says otherwise, in person:** fal zero-spend probe, reading the fal key,
  any provider call, any network access, any spend, any removal-lane code, any deploy.
- **The next gate is another SPECIFICATION REVIEW — not the probe.**
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + rounds 5–10 appends
  (do NOT rewrite — takes further appended corrections).**
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1. Python `py -3.11`.
  Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.
- **Next Progress-update = `13`. Next full backup = `v09`. Next issue-log number = `0034`.**

## For deeper context, read these entries only

- `VHE-ISSUE-LOG-0033` — body + rounds 5, 6, 7, 8, 9, **10** (later appends govern on conflict).
- `VHE-ISSUE-LOG-0032` — the base spec `0033` binds over.
- `VHE-ISSUE-LOG-0028` §7a — the governing owner ruling the whole chain discharges.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-26
