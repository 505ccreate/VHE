# VHE Handoff — 2026-07-27-40 (ROOM CLOSING → transfer to a fresh room)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — **Claude Opus 5** (Opus family signs `CC-OPUS-01` regardless of version; no `CC-OPUS-02`) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" — **THIS ROOM IS CLOSING** |
| **Session window** | 2026-07-26 ~22:28 → 2026-07-27 ~00:4x EDT (three work blocks; handoffs 38, 39, and this one) |
| **Project phase** | Removal-lane spec gate — round 10 filed on `0033`; **`Progress-update 13` built and verified.** Spec REJECTED at round 10, NOT build-authorized. |

**This is the final handoff for this room.** Pickup point for the new room:
`START-HERE_NEW-ROOM_2026-07-27.md` (read `CURRENT-STATUS.md` first, then START-HERE, then this file).

---

**Blueprint sections followed:** none exercised in this block — packaging and logging only. The round-10
correction itself (handoff 39) touched VHE-2 §4 · §4.1/§4.2 · §7 · §9.5 · §2 as **spec, not code.**

## What this room did (all three blocks)

1. **Block 1 (handoff 38):** opened the new room, read the required chain, verified disk state, drafted the
   paste-ready round-9 Eli relay. No work performed on the spec.
2. **Block 2 (handoff 39):** Ashley relayed Eli's **round-10 verdict** — package audit PASS, specification
   **REJECTED, 4 blockers + 1 documentation correction.** All four confirmed against real code before
   writing. Round 10 appended to `0033` (append-only: **315 insertions, 0 deletions**).
3. **Block 3 (this handoff):** built and verified **`VHE-Progress-update 13`**, the round-10 re-review
   artifact, then closed the room.

## `VHE-Progress-update 13` — built and verified

`C:\Users\user\Documents\VHE Backups\VHE FOR Review\VHE-Progress-update 13_2026-07-27.zip`

| Metric | Value |
|---|---|
| **Entries** | **161** (159 lean tracked files + `EXCLUDED-BINARIES-MANIFEST.md` + `PACKAGE-PROVENANCE.md`) |
| **Bytes (compressed ZIP)** | **1,023,617** |
| Uncompressed content | 1,895,082 |
| **SHA-256** | `D98ABFE75FDBFC664D74C40282FF2C8DD9A11EB58377D1FCE18D4F80EF79B61C` |
| Built at HEAD | **`241a27c`**, every tracked file committed |

**Method identical to `12`** (`_LOGS/README.md` + `VHE-ISSUE-LOG-0030`): full lean working tree from
`git ls-files`, image/video binaries stripped into the manifest, real directory structure with
**forward-slash** entry names. Built with `py -3.11` after PowerShell 5.1 mangled the UTF-8 em-dashes and
choked on markdown backticks — the tool changed, the rules did not.

**45/45 post-build verification checks PASSED:** ZIP integrity · 161 entries · 0 duplicates · 0 backslash
paths · 0 absolute/drive-letter/traversal paths · no real `.env` (only `.env.example`, itself checked to
carry no populated value beyond the two known non-secret defaults) · 0 image/video leaked (8 stripped) ·
no `library/tools/` · no `node_modules`/dependencies · no build output or caches · no `_IN-PROGRESS`
scratch · all required documents and cited source seams present · `0033` in-ZIP carries **all six**
appends (rounds 5–10) with `R10·0`–`R10·4` and the round-10 table/state names intact · **the three §4.2
options in `PACKAGE-PROVENANCE.md` match `0033`'s wording** · manifest titled for `13`.

**Two checks failed on the first run and I need to be precise about why:** option (ii) and the FK-count
correction were reported absent. Both were **verifier artifacts** — those phrases wrap across lines in the
source markdown and the check used naive substring matching. Re-run with whitespace normalisation: both
PASS. **No package content changed between the runs.** The ZIP built first is the ZIP shipped and its
SHA-256 above is unchanged — the fix was to the test, not the artifact.

**Build guard worth keeping:** the script aborts on a dirty tree, on any `.env` variant other than
`.env.example`, on a `library/tools/` leak, and on a tracked scratch file. It fired correctly on the first
run because my own untracked `_IN-PROGRESS` scratch made the tree non-clean. Rather than suppress it, the
guard now tolerates **only** that one untracked scratch path and **`PACKAGE-PROVENANCE.md` discloses the
real `git status --short` output** instead of asserting "clean." Every tracked file in the package is
committed at `241a27c`.

**Deliberate inclusion, flagged for the owner:** the **six `.docx` blueprints are included**, as in every
prior package — they are authoritative source-of-truth documents, not media assets, and the strip rule
inherited from `12` covers image/video only. Ashley's instruction said "no binaries"; her adjacent
instruction said "rules identical to Progress Update 12." I followed `12`'s rule and disclosed the choice
in the provenance and manifest. **Say the word if the `.docx` should be stripped from future packages** —
that would change the convention, so I did not do it unilaterally.

**The three VHE-2 §4.2 options are reproduced in `PACKAGE-PROVENANCE.md` exactly as filed**, with an
explicit statement that Eli reviews the actual documents and source before choosing or rejecting any
option, and that nothing presumes an outcome.

## Tested — with actual results

**No tests were run, on instruction and because no source changed.** Standing figures, last actually
measured at `52e3277`: **Vitest 153/153 PASS (17 files)** on Node v22.23.1 · **preflight PASS 13 / FAIL 4
/ SKIP 1** (the four FAILs are the undelivered real §1 AI fixtures).

## Files created or changed (this block)

- `_LOGS/README.md` — Progress-update history extended with `13`; **next is `14`**.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — `13`'s measured metrics and verification record; pickup
  order updated for the transfer; next-action reordered to put the upload first.
- `_LOGS/STATUS-HANDOFF/START-HERE_NEW-ROOM_2026-07-27.md` — **rewritten** for this transfer.
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-27-40_...md` — this handoff.
- `_LOGS/STATUS-HANDOFF/_IN-PROGRESS_CC-OPUS-01.md` — created at block start, deleted at block end.
- `VHE Backups\VHE FOR Review\VHE-Progress-update 13_2026-07-27.zip` — created.
- **No `packages/`, `scripts/`, `migrations/`, blueprint, `0032`, or `0033` content was touched in this
  block.** The build and verify scripts live in the session scratchpad, outside the repo, deliberately —
  no tracked packaging script has ever existed in this project.

## Not done — deliberately

- **No full backup `v09`** — instructed not to create one. `v08` remains the latest; the number still
  climbs when one is next cut.
- **No tests run for packaging** — instructed, and no source changed.
- Nothing uploaded, probed, keyed, networked, or spent. Building a package is not sending it.

## Unfinished / left mid-work

Nothing. The room closes clean: tree committed, package built and verified, logs written.

## CARRY-OVER — FOR ASHLEY

1. **Upload `VHE-Progress-update 13` to the Eli room** for the round-10 re-review, with the FOR-ELI block
   below. It is the only thing standing between the project and its next move.
2. **The OPEN DECISION is yours** — the VHE-2 §4.2 verbatim-boundary edit site for the direct-ledger
   write (options (i)/(ii)/(iii), reproduced in `0033` R10·3, `CURRENT-STATUS.md`, and the package
   provenance). Eli may advise; you decide.
3. **Should `.docx` blueprints keep shipping in review packages?** Flagged above — `13` includes them,
   consistent with every prior package.
4. **`S3_REGION`** concrete value for the live fal `image.inpaint` validation (`0027`) — outstanding,
   non-blocking.
5. **The 4 frozen §1 AI fixtures** (`bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`,
   `bad_hand_6s.mp4`) — still owed as files; the only Phase-0 exit-gate FAILs (`0009`/`0011`).

## CARRY-OVER — FOR ELI (relay with `Progress-update 13`)

1. Do the four round-10 resolutions clear the blockers?
2. Specifically: (a) the **split claim-miss table** — only `in_flight` polls a durable `provider_job_id`,
   a **live** `submitting` waits on the owner's lease, a **stale** one becomes `submission_unknown` and
   parks with the reservation `held`, plus the newly-added **`prepared`** rows; (b)
   **`provider_operation_followers`** as the cross-job attachment mechanism, with
   `job_execution_bindings` left same-job and **unweakened**; (c) the rule that a follower woken by a
   **failed** operation must **re-acquire** a reservation and may fail on the cap; (d) **`origin='direct'`**
   as the third ledger origin with `UNIQUE (job_id) WHERE origin='direct'`, and the invariant that every
   cent in `jobs.cost_cents` appears exactly once as a reconciled ledger row; (e) the
   **`job_wakeup_outbox`** + dispatcher + retained sweeper, and the effectively-once chain (outbox ∧
   BullMQ `{jobId}` dedupe ∧ guarded single-winner claim); (f) **`job_parent_blocks`** as the durable home
   for `blocking_child_job_id`, with the composite FK to `jobs (id, parent_job_id)`.
3. **The three §4.2 verbatim-edit-site options** are in `PACKAGE-PROVENANCE.md` and `0033` R10·3 exactly
   as filed. Your view is welcome; **Ashley decides.**
4. **Is the pre-existing non-routed cap-overshoot gap** (direct-spend jobs hold no reservation while
   running) something to address in a later round, or left as existing §4.1/§2 behavior? Round 10 named
   it and deliberately did not fix it.
5. If items remain: **append to `0033`** as round 11 — do not rewrite `0032`, `0033`'s body, or rounds
   5–10.

## Blockers, warnings, dependencies

- **NOT authorized until Ashley says otherwise, in person:** fal zero-spend probe, reading the fal key,
  any provider call, any network access, any spend, any removal-lane code, any deploy.
- **The next gate is another SPECIFICATION REVIEW — not the probe.**
- **`0031` frozen · `0032` base spec (do NOT rewrite) · `0033` binding correction + rounds 5–10 appends
  (do NOT rewrite — takes further appended corrections).**
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1. Python `py -3.11`.
  Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.
- **Next Progress-update = `14`. Next full backup = `v09`. Next issue-log number = `0034`.**

## For deeper context, read these entries only

- `VHE-ISSUE-LOG-0033` — body + rounds 5, 6, 7, 8, 9, **10** (later appends govern on conflict).
- `VHE-ISSUE-LOG-0032` — the base spec `0033` binds over.
- `VHE-ISSUE-LOG-0030` — the packaging-defect entry the build method discharges.
- `VHE-ISSUE-LOG-0028` §7a — the governing owner ruling the whole chain discharges.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-27
