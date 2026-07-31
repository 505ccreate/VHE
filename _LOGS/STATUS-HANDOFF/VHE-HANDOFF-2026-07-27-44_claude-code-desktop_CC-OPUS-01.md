# VHE Handoff — 2026-07-27-44 (round-12 correction filed; §4.2 amendment AUTHORIZED)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — **Claude Opus 5** (Opus family signs `CC-OPUS-01` regardless of version; no `CC-OPUS-02`) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" — **the planned new room was not needed**; Ashley pasted Eli's response into this room with context intact. Model switched back to Opus 5 via `/model`. |
| **Session window** | 2026-07-27, continuing the ~04:35 session (handoffs 41, 42, 43, and this one) |
| **Project phase** | Removal-lane spec gate — **round 12 filed on `0033`**. Spec REJECTED at round 12 (8 blockers), NOT build-authorized. **VHE-2 §4.2 amendment AUTHORIZED by the owner but NOT YET APPLIED.** |

**Note on handoff 43:** it closed this room in anticipation of a transfer that did not happen. The
briefing it wrote into `START-HERE_NEW-ROOM_2026-07-27.md` was nonetheless correct in substance — Eli's
response did arrive as predicted and was applied as a round-12 append. **That START-HERE is now one round
stale**; this handoff supersedes it.

---

## What this block did

1. Ashley pasted Eli's **round-12 verdict** on `VHE-Progress-update 14`.
2. **Package audit: PASS**, with every metric independently reproduced by Eli — 164 entries, 1,049,701
   compressed, 1,961,268 uncompressed, SHA-256 `5F14F62A…C20EC8E`, **Update 13's complete `0033` an exact
   prefix of Update 14's**, `0032` byte-for-byte unchanged, no source changed 13→14. **All match my
   recorded figures exactly** — the packaging method is holding.
3. **Specification REJECTED — 8 blockers.** Verified every one against real source or real prior text
   before writing, then appended round 12 to `0033`. **Append-only: 481 insertions, 0 deletions.**
4. Recorded the owner's decision authorizing the VHE-2 §4.2 amendment — **without touching the blueprint.**

## The eight blockers — all correct, seven of them round 11's own defects

| # | Blocker | Verified against |
|---|---|---|
| R12·1 | **`wake:{outbox_id}` is an illegal BullMQ job id** — a hard runtime `throw`, not a style point | `node_modules/bullmq/dist/cjs/classes/job.js:1049-1051` (**installed source**, not docs) |
| R12·2 | Followers woken for non-actionable states; opens a **lost-wake race** via a transiently-`running` follower | round-11 R11·2 vs R11·1's resume predicate |
| R12·3 | `dispatched_at` doesn't prove consumption; sweeper can re-insert every cycle | round-11 R11·6 index predicate |
| R12·4 | **Crash after the resume claim strands the job**; takeover increments `attempt` and enters initial-submit | `worker.ts:35-45`, `:37`, `:76` |
| R12·5 | **R11·3 and R8·6 are unimplementable together** — released reservations still block re-reservation | `0033:1324-1326`, reasoning at `0033:980-985` |
| R12·6 | Follower PK forbids a job ever following the same operation twice | round-10 R10·2 PK vs R6·4 operation permanence |
| R12·7 | Direct-ledger key is an alternative, not a schema | round-11 R11·7 |
| R12·8 | Queue payload is still two contracts (`execute` as wake_kind **and** legacy `{jobId}`) | round-11 R11·5 |

**Blocker 1 deserves singling out.** It is not a design disagreement — `Job.add` **throws
`Custom Id cannot contain :`** for any colon id that doesn't split into exactly 3 parts. Every wake
delivery round 11 specified would have failed at the queue boundary on first execution. I caught the
detail only by reading the installed source rather than trusting recollection of BullMQ's docs.

**One finding of my own on top of it:** the guard *does* admit a 3-part colon id
(`wake:{id}:{generation}` would pass today) — and it must **never** be used. The two comment lines
directly above the check say the exemption exists only for legacy repeatable jobs and is slated for
removal in BullMQ's next breaking change. Building the wake transport on it would be a deliberate bet on
a deprecation. Filed as a binding rule: **no BullMQ custom job id in this project ever contains a colon.**

## OWNER DECISION — VHE-2 §4.2 option (iii) AUTHORIZED

**Ashley authorized a documented amendment to VHE-2 §4.2**, closing the OPEN DECISION carried since round
10 and resolving round 11's missing-cost-channel finding. The amendment specifies a **typed execution
failure/result contract** (frozen claim-time `execution_attempt`, provider/operation refs, submission
disposition, charge state, known `cost_cents`, retryability + machine code), with binding rules: known
billed failures are ledgered **before** retry/terminate; `accepted`/`ambiguous` with unknown cost enters
reconciliation and **never auto-retries**; **`jobs.cost_cents` is recomputed from the reconciled ledger
sum and the `cost_cents=$3` assignment is amended so it can never overwrite the rollup**; terminal state +
ledger + rollup in **one short Postgres transaction**; **no DB transaction ever held open across a network
call.**

**I did NOT edit the blueprint, deliberately.** Three reasons, all recorded in `0033` R12: (a) `CLAUDE.md`
and `_LOGS/README.md` both declare VHE-1–VHE-4 intact and not to be modified — superseding a project-wide
"do not modify" rule should happen once, explicitly, with the owner watching, not as a side effect of
filing a correction; (b) Eli's own instruction was "append round 12 to `0033` only"; (c) the edit has a
mandatory companion step (`_BLUEPRINTS-TEXT/_regenerate.py` rerun in-session) on a **binary** file where a
botched edit isn't reviewable in a diff.

**Pending blueprint task for Ashley to green-light separately:** amend §4.2 per the typed contract; amend
the §4.1 payload line for the `kind:"execute"` discriminant — **flagged as needing the SAME authorization,
since her grant was scoped to §4.2 and I am not stretching it**; rerun the regenerate script; file it as
its own entry **`0034`**.

## Tested — with actual results

**No tests were run. No source file was created, changed, or deleted.** Standing figures, last actually
measured at `52e3277`: **Vitest 153/153 PASS (17 files)** on Node v22.23.1 · **preflight PASS 13 / FAIL 4
/ SKIP 1**. The BullMQ verification for R12·1 was a **source read**, not an execution — no Redis, no
network, no queue was touched.

## Files created or changed

- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0033_...md` — **round-12 correction appended** (481
  insertions, 0 deletions; verified append-only via `git diff --numstat`).
- `_LOGS/LOG-INDEX.md` — `0033` row extended with the round-12 summary; status updated.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — rewritten for round 12, incl. the boxed §4.2-authorization
  section and the corrected spec chain.
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-27-44_...md` — this handoff.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-OPUS-01.md` — plan written **before** the work, checkpointed
  through it, deleted at block end.
- **No `packages/`, `scripts/`, `migrations/`, blueprint, `0032`, or `0033`-body content was touched.**

## Not done — deliberately

- **No blueprint edit** — authorization recorded, edit deferred to its own task (see above).
- **No full backup `v09`** — Eli says still not needed.
- **No source changes, no probe, no key read, no network, no provider call, no upload, no spend.**

## `VHE-Progress-update 15` — built and verified (after the round-12 commit, per Eli's gate)

`C:\Users\user\Documents\VHE Backups\VHE FOR Review\VHE-Progress-update 15_2026-07-27.zip`

| Metric | Value |
|---|---|
| **Entries** | **167** (165 lean tracked + manifest + provenance) |
| **Bytes (compressed ZIP)** | **1,078,864** |
| Uncompressed content | 2,034,859 |
| **SHA-256** | `AD95378016F537D167371EEBB7E3E8BADBB658DEEDBFB00D1FAB78CDEACED971` |
| Built at HEAD | **`9f73cf5`** — the round-12 correction commit |

**28/28 post-build verification checks PASSED**, including that `0033` in-zip carries **all eight**
appends (rounds 5–12) with `R12·1`–`R12·8` and the `job.js:1049-1051` citation intact, and that
`PACKAGE-PROVENANCE.md` states option (iii) is **AUTHORIZED** (not merely recommended) and that the
blueprint `.docx` was **NOT** edited.

**Build integrity — a mistake I made and caught, stated plainly.** The first build of `15` shipped with
**stale round-11 provenance wording** — it still said Eli *recommends* option (iii) — because a scripted
edit to the build script silently failed its match and I ran the build anyway. In a review artifact that
is a materially misleading statement: it would have told Eli his recommendation was still pending when
Ashley had already authorized it. **Caught by inspecting the build output, discarded, rebuilt.** No metric
from the bad build was ever recorded, and it was never referenced or shipped. The SHA-256 above is the
rebuilt artifact. **Process lesson: assert that a scripted edit actually applied before running the thing
it edits** — the same silent-failure class the round-12 blockers are about.

## Unfinished / left mid-work

Nothing. Round 12 is filed and committed, and `Progress-update 15` is built and verified.

## CARRY-OVER — FOR ASHLEY

1. **Green-light the blueprint amendment task (`0034`)** when you're ready — it's the one thing round 12
   authorized that I deliberately did not do.
2. **The §4.1 payload change needs your explicit nod too** — your authorization named §4.2, and R12·8
   requires touching §4.1's verbatim add-options line. I did not assume the grant stretched.
3. **Upload `VHE-Progress-update 15` to the Eli room** for the round-12 re-review — built, verified
   28/28, and ready. This is an owner action.
4. Standing: `S3_REGION` for the live fal validation (`0027`); the 4 frozen §1 AI fixtures.

## CARRY-OVER — FOR ELI (relay with `Progress-update 15`)

1. Do the eight round-12 resolutions clear the blockers?
2. Specifically: (a) **`wake-{outbox_id}`** plus the binding no-colon rule and the explicit refusal to use
   the deprecated 3-part exemption; (b) the **actionable-only** wake set with `in_flight` retracted and
   **round-10 test 1 retracted in full**; (c) **operation-level reconciler adoption** of an accepted
   operation whose owner died, with the reservation staying `held`; (d) the **delivery lifecycle**
   (`dispatch_generation` / `dispatch_lease_expires_at` / `consumed_at` in the same TX as the winning
   claim) and the corrected `WHERE consumed_at IS NULL` index; (e) the **durable continuation marker** and
   per-mode stale takeover; (f) the **new-routing-attempt** continuation that never re-reserves the
   released walk; (g) the follower table's **own `id` PK + partial unique on `state='waiting'`**; (h) the
   single direct-ledger grain with per-origin CHECKs; (i) the verbatim **`QueueDelivery`** union with
   `execute` removed from `wake_kind`.
3. **Is the blueprint-amendment sequencing right?** I recorded the §4.2 authorization but deferred the
   actual `.docx` edit to its own task with its own entry (`0034`), and flagged §4.1 as needing separate
   authorization. Confirm that's the order you'd want.
4. If items remain: **append to `0033`** as round 13 — do not rewrite `0032`, `0033`'s body, or rounds
   5–12.

## Blockers, warnings, dependencies

- **NOT authorized until Ashley says otherwise, in person:** fal zero-spend probe, reading the fal key,
  any provider call, any network access, any spend, any removal-lane code, any deploy.
- **The next gate is another SPECIFICATION REVIEW — not the probe.**
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + rounds 5–12 appends
  (do NOT rewrite — takes further appended corrections).** **Later appends govern on conflict.**
- **VHE-2 §4.2 amendment is AUTHORIZED but NOT APPLIED.** Until entry `0034` exists and the `.docx` is
  amended, VHE-2 on disk still says what it always said. Do not cite the amendment as if it were in the
  blueprint.
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1. Python `py -3.11`.
  Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.
- **Next Progress-update = `16`. Next full backup = `v09`. Next issue-log number = `0034`** (reserved for
  the blueprint amendment).

## For deeper context, read these entries only

- `VHE-ISSUE-LOG-0033` — body + rounds 5–**12** (later appends govern on conflict).
- `VHE-ISSUE-LOG-0032` — the base spec `0033` binds over.
- `VHE-ISSUE-LOG-0030` — the packaging-defect entry the build method discharges.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-27
