# VHE Handoff — 2026-07-27-41 (round-11 correction filed)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — **Claude Opus 5** (Opus family signs `CC-OPUS-01` regardless of version; no `CC-OPUS-02`) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" — **NEW ROOM**, opened 2026-07-27 ~04:35 EDT |
| **Session window** | 2026-07-27 ~04:35 → ~05:1x EDT |
| **Project phase** | Removal-lane spec gate — **round 11 filed on `0033`**. Spec REJECTED at round 11 (7 blockers), NOT build-authorized. |

---

**Blueprint sections followed:** none exercised as code. The round-11 correction touches VHE-2 §4 ·
§4.1/§4.2 · §4.3 · §2 · §7 as **specification, not implementation.**

## What this session did

1. Opened the new room and read the required chain in order (`_LOGS/README.md`, `CURRENT-STATUS.md`,
   `START-HERE_NEW-ROOM_2026-07-27.md`, handoff 40, `SESSION-PROTOCOL.md`, `AI-ACCOUNT-REGISTRY.md`).
   Verified disk state independently: tree clean, HEAD `8dfbdc4`, `Progress-update 13` present at
   1,023,617 bytes. No stale `_IN-PROGRESS` left by the previous room.
2. **Wrote the session plan into `_IN-PROGRESS_CC-OPUS-01.md` BEFORE starting the work**, at Ashley's
   explicit instruction (she flagged limited session time and wanted the logs to survive a cutoff).
   Every blocker verification was checkpointed into it as it completed.
3. Ashley relayed Eli's **round-11 verdict** on `VHE-Progress-update 13`: **package audit PASS,
   specification REJECTED, 7 blockers.**
4. Verified **all seven** against real code / real prior text with file:line **before writing any
   correction**, then appended round 11 to `0033`.

## `VHE-ISSUE-LOG-0033` — round-11 correction appended

**Append-only, verified by git: 414 insertions, 0 deletions.** `0032`, `0033`'s body, and rounds 5–10 are
untouched.

**All seven blockers are correct. Five are defects introduced by round 10's own correction**, and three of
those are contradictions between a round-10 **rule** and a round-10 **test**:

| # | Blocker | Verified against |
|---|---|---|
| R11·1 | Follower relationship has no durable **job** lifecycle | `worker.ts:68-72` (would mark a parked follower `succeeded`), `:37`, `:39-40`, `:83-85` |
| R11·2 | Wake-up set omits `in_flight` (round-10 **test 1** requires it) and strands `parked` followers at reconciliation | `0033:1829-1834` vs `0033:1970-1972` |
| R11·3 | `failed` branch contradicts R10·1, and generic `failed` ≠ pre-acceptance rejection | `0033:1782` vs `:1835`; R5·5 `0033:370-383`; R8·4 `0033:1217` |
| R11·4 | **BullMQ `{jobId}` dedupe prevents the wake-up rather than deduplicating it** | `queues.ts:85`; grep `removeOnComplete`/`removeOnFail` in `packages/` = **0 hits**; `package.json:20` bullmq 5.80.1 |
| R11·5 | Transport cannot reach any resume claim — every rounds-9/10 resume is silently dropped | `runtime.ts:49`, `:54-55`, `:62`, `:66`; `worker.ts:39-40` |
| R11·6 | Sweeper cannot cover a **stopped** dispatcher (round-10 **test 10** is impossible) | `0033:1943-1945` vs `0033:1994-1995` |
| R11·7 | `origin='direct'` grain is per-job; misses charged failures across up to 3 attempts | `worker.ts:76`, `queues.ts:59-62`, R8·4 `0033:1217-1218`, `reserved_cents INT NOT NULL` `0033:578` |

**Five consequences filed that Eli did not name** (found by tracing each requirement into the real code
rather than accepting it as writable):

1. **The §4.2 failure path has no cost channel at all** — `worker.ts:77-81` writes no `cost_cents`, and
   `ApiError` (`errors.ts:28-37`) carries only `code`/`httpStatus`. A handler that knows the provider
   charged for an accepted-then-failed attempt cannot report the amount, so R11·7's requirement is not
   implementable as the code stands. **Filed as an open spec question, deliberately not decided.**
2. **A derived `cost_cents` collides with the verbatim `cost_cents=$3` write** (`worker.ts:69-71`) — the
   rollup would be overwritten by the last attempt's figure. Strengthens the §4.2 OPEN DECISION; does not
   decide it.
3. **`reserved_cents = 0` applies to `backfill` as well as `direct`** — Eli named only `direct`; neither
   R9·4's backfill row nor R10·3's direct row supplied a value for a `NOT NULL` column.
4. **`execution_attempt` must be the claim-time frozen `attempt`** from the row returned at
   `worker.ts:35-45`, not a live read of `jobs.attempt`, which `worker.ts:37` mutates on every takeover.
5. **The outbox needs `UNIQUE (target_job_id, wake_kind) WHERE dispatched_at IS NULL`** — a blanket key
   would block the very re-wake the sweeper exists to provide after a dispatched-but-ineffective delivery.

**A new standing pre-filing step was added to the round's closing discipline:** *read the round's own added
tests back against the round's own added rules.* Three of these seven blockers were findable in minutes by
that check alone, without leaving the document.

## Owner / reviewer decisions recorded (NOT enacted by me)

- **VHE-2 §4.2 OPEN DECISION:** Eli **recommends option (iii)** — a documented amendment to §4.2 — with
  the implementation constraint that the terminal update plus ledger writes sit in a **short Postgres
  transaction** and that **a DB transaction is never held open across a provider call**. **Recorded only.
  Ashley decides.** I did not choose a VHE-2 amendment on a reviewer's recommendation.
- **Keep the six `.docx` blueprints in future review packages** — this **closes handoff 40's carry-over
  question**. Convention unchanged; `13`'s inclusion was correct.
- **No full backup `v09`** yet.
- **Do NOT build `Progress-update 14`** until the round-11 corrections are filed **and committed**.

## Tested — with actual results

**No tests were run.** No source file was created, changed, or deleted this session — the work was
specification and logging only. Standing figures, last actually measured at `52e3277`: **Vitest 153/153
PASS (17 files)** on Node v22.23.1 · **preflight PASS 13 / FAIL 4 / SKIP 1** (the four FAILs are the
undelivered real §1 AI fixtures).

**One limit stated plainly:** R11·4 rests on BullMQ's documented retention of completed jobs. That
behavior is **not proven in this tree** — `runtime.test.ts:173-179` exercises duplicate suppression only
against a **waiting** job — and **I did not measure it this session** (no Redis, no network). Round-11
test 4 exists to close that gap before anything is built.

## Files created or changed

- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — **round-11 correction appended** (414
  insertions, 0 deletions; verified append-only via `git diff --numstat`).
- `_LOGS/LOG-INDEX.md` — `0033` row extended with the round-11 summary; status updated to "rounds 5–11
  appended; REJECTED at round 11 (7 blockers)".
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — overwritten with the round-11 state.
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-27-41_...md` — this handoff.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-OPUS-01.md` — created at session start with the full plan written
  **before** the work (Ashley's instruction), checkpointed throughout, deleted at session end.
- **No `packages/`, `scripts/`, `migrations/`, blueprint, `0032`, or `0033`-body content was touched.**

## Not done — deliberately

- **No `Progress-update 14`** — Eli's explicit instruction: not until round 11 is filed and committed.
- **No full backup `v09`** — Eli says not needed yet.
- **No decision on the VHE-2 §4.2 edit site** — the owner's call, and round 11 records Eli's
  recommendation without acting on it.
- Nothing probed, keyed, networked, uploaded, or spent.

## Unfinished / left mid-work

Nothing. Round 11 is filed and the logs are complete.

## CARRY-OVER — FOR ASHLEY

1. **Decide the VHE-2 §4.2 OPEN DECISION.** Eli recommends **(iii)**, a documented amendment. Round 11
   adds one argument to weigh: the §4.2 terminal block now needs both an **added ledger write** and a
   **changed `cost_cents` expression** (consequence 2 above), which is more than an additive
   `// BUILDER:` line naturally covers. **Still your call, not his and not mine.**
2. **Two open spec questions raised by round 11** that need a direction before build:
   (a) how a handler reports a **known charge on a failed attempt** — a billed-amount field on the §4.3
   error type, or a handler-side ledger write before throwing; (b) confirmation that the transport payload
   change in R11·5 (`{jobId}` → `{targetJobId, wakeKind, outboxId}`) is acceptable — it sits in
   BUILDER-owned `runtime.ts`, not the verbatim §4.2 body, and §4.1's verbatim `add(type,{jobId},{jobId})`
   line is **not** modified.
3. **When round 11 is committed, `Progress-update 14` becomes buildable** — that is the gate Eli set.
4. Standing, unchanged: `S3_REGION` for the live fal `image.inpaint` validation (`0027`); the 4 frozen §1
   AI fixtures (`bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`, `bad_hand_6s.mp4`).

## CARRY-OVER — FOR ELI (relay with `Progress-update 14`, once built)

1. Do the seven round-11 resolutions clear the blockers?
2. Specifically: (a) **`awaiting_provider_operation`** as the follower's durable job state, with the
   guarded park/resume pair and the one-transaction structural link to the follower row; (b) **followers
   never poll** — the `parked` follower state retracted in favor of re-parking as `waiting`, and the exact
   wake set including **`in_flight`** and every reconciliation transition; (c) the **structured-outcome**
   failure branch (only proven `preaccept_rejected` may continue a walk, and only after re-acquiring a
   reservation); (d) **`wake:{outbox_id}`** as the delivery id with `{targetJobId, wakeKind, outboxId}` as
   the payload; (e) **`wake_kind`** as the explicit dispatch selector, never inferred from status; (f) the
   sweeper as **intent repair only**, with delivery availability from redundant dispatchers and the
   **undispatched-only** partial unique index; (g) the **`(job_id, execution_attempt)`** direct-ledger
   grain with the claim-time frozen attempt, and `reserved_cents=0` on **both** `backfill` and `direct`.
3. **The two questions round 11 raises rather than answers:** the missing cost channel on the §4.2 failure
   path, and the derived-`cost_cents` collision with the verbatim write. Both bear on the §4.2 decision.
4. **Is R11·2's "followers never poll" model complete** as stated, or does any transition still leave a
   follower without a wake?
5. If items remain: **append to `0033`** as round 12 — do not rewrite `0032`, `0033`'s body, or rounds
   5–11.

## Blockers, warnings, dependencies

- **NOT authorized until Ashley says otherwise, in person:** fal zero-spend probe, reading the fal key,
  any provider call, any network access, any spend, any removal-lane code, any deploy.
- **The next gate is another SPECIFICATION REVIEW — not the probe.**
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + rounds 5–11 appends
  (do NOT rewrite — takes further appended corrections).** **Later appends govern on conflict.**
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1. Python `py -3.11`.
  Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.
- **Next Progress-update = `14` (blocked until round 11 is committed). Next full backup = `v09`. Next
  issue-log number = `0034`.**

## For deeper context, read these entries only

- `VHE-ISSUE-LOG-0033` — body + rounds 5, 6, 7, 8, 9, 10, **11** (later appends govern on conflict).
- `VHE-ISSUE-LOG-0032` — the base spec `0033` binds over.
- `VHE-ISSUE-LOG-0028` §7a — the governing owner ruling the whole chain discharges.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-27
