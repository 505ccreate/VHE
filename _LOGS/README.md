# VHE / Correction Studio — Logging System

**Read this file first. It is the entry point for every AI account, platform, and project room.**

This project is worked on across multiple AI platforms, accounts, sessions, and rooms.
These logs exist so that no builder ever has to guess, assume, drift, or re-derive context
that a previous builder already established.

---

## The 60-second onboarding (do this, in this order)

1. Read `STATUS-HANDOFF/CURRENT-STATUS.md` — the single latest state of the project.
2. Read the most recent file in `STATUS-HANDOFF/` — the last session's handoff.
3. Read **only** the numbered `ISSUE-RESOLUTION-LOG/` entries that the handoff explicitly points you to.
4. Read `SESSION-PROTOCOL.md` — the rules for how you log *during* your session.
5. Confirm your account identifier in `AI-ACCOUNT-REGISTRY.md`. If you are not listed, ask the
   project owner for one before writing any log entry. Do not invent one.

**Do not read the entire Issue & Resolution Log Library.** It is a reference archive, not required
reading. Consult it only when the handoff points you to a specific entry, when you hit a failure that
smells familiar, or when you need to understand *why* a past decision was made.
`LOG-INDEX.md` is the lookup table for finding a specific entry without opening files.

---

## The two logging systems (they are separate on purpose)

### 1. Issue & Resolution Log Library — `ISSUE-RESOLUTION-LOG/`
The project's permanent technical memory and diary. One file per numbered entry.
Detailed by design. Never overwritten. Numbering is consecutive across the *entire project* —
it does not restart for a new platform, room, phase, or AI account.

Naming: `VHE-ISSUE-LOG-####_[short-description]_[username].md`
Template: `ISSUE-RESOLUTION-LOG/_TEMPLATE_VHE-ISSUE-LOG.md`

Log here: mistakes, failures, unexpected behavior, dead ends, important discoveries,
architectural corrections, and anything a future builder would waste time rediscovering.

### 2. Status & Handoff Logs — `STATUS-HANDOFF/`
Short operational logs used to transfer the project between sessions, rooms, platforms, and accounts.
These exist to **reduce token usage**. Keep them concise. They never duplicate a diary entry —
they reference it by exact number.

Naming: `VHE-HANDOFF-YYYY-MM-DD-##_[platform]_[username].md`
Template: `STATUS-HANDOFF/_TEMPLATE_VHE-HANDOFF.md`

`CURRENT-STATUS.md` is always overwritten with the latest state — it is the one file that is
*meant* to be replaced. The dated handoff files are the permanent record and are never overwritten.

---

## Backup routine (permanent — owner ruling 2026-07-23)

Full-project backup zips live in **`C:\Users\user\Documents\VHE Backups\`**, never the project root.

- **Naming:** `VHE-BACKUP-FULL_v##_YYYY-MM-DD.zip`, numbered **consecutively** in true chronological
  order (verify by existing file timestamps in that folder, not by filename date, before assigning the
  next number).
- **Contents:** every `git ls-files`-tracked file from the **current working tree** (not `git archive
  HEAD` — uncommitted log updates must be captured too) **plus** any currently-untracked files the
  owner has flagged as pending-but-wanted (e.g. an addon doc awaiting a decision). Verify no `.env` or
  other secret file is swept in before compressing.
- **Verify after creating:** entry count matches the intended file count, SHA-256 of the zip, and that
  no `.env` appears inside. Record all three in `CURRENT-STATUS.md`.
- History: v01 2026-07-20 · v02 2026-07-21 · v03 2026-07-22 (raw-copy method, folded into the same
  series) · v04 2026-07-23 · v05 2026-07-23 (same day, working-tree method adopted) · v06 2026-07-24
  (**DEFECTIVE flattened — do not use**, see `VHE-ISSUE-LOG-0030`; kept, superseded by v07) · v07
  2026-07-24 · v08 2026-07-24 (round-6 room close; captures round-5+round-6 on `0033`, handoffs 32/33/34,
  rewritten START-HERE; metrics in `CURRENT-STATUS.md`). **Next is v09.** Verify the highest existing
  `v##` by folder timestamps before assigning the next (v06 counts even though defective).

### Review/context packages ("Progress-update" series — owner ruling 2026-07-24, supersedes prior naming)

Lean packages for uploading to other AI platforms for cross-review.

- **Location — owner ruling 2026-07-24 (later same day, supersedes the "same `VHE Backups\` folder" line
  below):** all Progress-update packages now save to the subfolder
  **`C:\Users\user\Documents\VHE Backups\VHE FOR Review\`**, not the `VHE Backups\` root. The owner moved
  `01`–`04` there by hand to establish it; every future package (`05` on) is built directly into that
  subfolder. Full backups (`VHE-BACKUP-FULL_v##`) are unaffected — they stay in the `VHE Backups\` root.
  This keeps the two series visually separated in the folder view.
- **Naming:** `VHE-Progress-update ##_YYYY-MM-DD.zip`, numbered **consecutively**, two-digit, same
  chronological-order-by-timestamp rule as the full-backup series above. The numbering sequence is
  unaffected by the location change — check the `VHE FOR Review\` subfolder (not the `VHE Backups\` root)
  for the highest existing `##` before assigning the next one.
- **Superseded names — do not reuse:** `VHE-CONTEXT-FOR-ELI_*.zip`, `VHE-SECTION-*-ELI-REVIEW_*.zip`,
  `VHE-progaress sofar_*.zip`. Owner reason: re-uploading a file under an identical name to an online AI
  platform is sometimes rejected as a duplicate; a consecutive number sidesteps that.
- **Contents:** same method as the full backup — current working tree via `git ls-files` + any
  owner-flagged untracked files (this INCLUDES the current session's not-yet-`git add`ed logs/handoffs —
  never assume `git ls-files` alone is "the current work", see `VHE-ISSUE-LOG-0030`) — with heavy
  binaries (images/video: png/jpg/jpeg/mp4/mov/gif/webp/bmp/ico) stripped for a lean upload. Verify no
  `.env` inside before compressing.
- **Structure + portability (VHE-ISSUE-LOG-0030):** the zip MUST preserve real directory structure
  (never build it by flattening a file array — stage into a mirror dir, or set entry names explicitly).
  Prefer **forward-slash** zip entry paths for Linux-`unzip` portability — `Compress-Archive` writes
  backslashes, so use `System.IO.Compression.ZipArchive` with explicit forward-slash entry names (or
  `git archive` + a second pass for untracked additions) when portability matters.
- **Internal manifest:** include an `EXCLUDED-BINARIES-MANIFEST.md` listing each stripped file's original
  path, size, and SHA-256. Its title MUST name the exact package/file it ships in (if the file is later
  renamed to a new number, re-cut so the internal name matches — do not ship an `02` that says `01`).
- **Package provenance (added 2026-07-24, `VHE-ISSUE-LOG-0033` R8·7):** include a generated
  `PACKAGE-PROVENANCE.md` recording, at build time, `git rev-parse HEAD`, the one-line commit summary,
  `git status --short` (so uncommitted working-tree state is disclosed rather than implied), the file
  counts, and the inclusion/exclusion rule applied. Added in response to the reviewer's correct
  observation that a ZIP lacking `.git` metadata cannot authenticate the repository HEAD. **It is a
  build-time record, NOT cryptographic proof** — the file must say so itself. Applies from `11` onward.
- **`.env.example` wording (corrected 2026-07-24, `VHE-ISSUE-LOG-0033` R9·0):** `.env.example` ships in
  every package and is **credential-free**, but it is **not** "all-empty" — it carries the non-secret
  defaults `S3_REGION=auto` and `VHE_REPAIR_MEMORY_CEILING_BYTES=4294967296`. Standing wording for
  provenance/status files: **"all credential-bearing values are empty; safe non-secret configuration
  defaults are permitted."** The packaging safety check is unchanged and remains correct — it aborts the
  build on any `.env` variant other than `.env.example`.
- **Retention — changed from the old rule:** these are **NOT** deleted/replaced on each new one (the
  old "keep only latest" rule is retired). The full backups already preserve everything; keep the
  Progress-update series around too — the owner may prune old ones manually later, but **the next
  number always keeps climbing** regardless of what still exists on disk. Check existing filenames in
  the folder for the highest `##` before assigning the next one; do not assume nothing was deleted.
- History: 01 2026-07-24 (first under this convention; superseded the same-session
  `VHE-CONTEXT-FOR-ELI_2026-07-24.zip`, which the owner renamed by hand) · 02 2026-07-24 (the corrected
  post-`VHE-ISSUE-LOG-0030` build; owner renamed 01→02 on disk for upload; the file Eli audited) · 03
  2026-07-24 (sent for Eli's round-2 review; does NOT contain round 2's correction, since that was
  appended to `0031` after `03` was sent) · 04 2026-07-24 (first package containing both correction
  rounds; 145 entries incl. manifest; sent for Eli's round-3 review) · 05 2026-07-24 (**curated
  verification subset** — NOT the full lean tree; contains `0032` under round-4 review, frozen `0031`,
  the `0024`–`0029` spec chain it builds claims on, CURRENT-STATUS/LOG-INDEX/handoff-29, and the source
  files `0032` makes code-seam claims about; 36 files + manifest = 37 entries; 175,516 bytes; SHA-256
  `FE9F49611567B5EBD2EB6C337393E4D40C6F8B87C439286B7DE00FD1533FDB55`; reviewed by Eli in round 4) · 06
  2026-07-24 (**room-transfer package** — hands the removal-lane work to a new Claude Code room + a new
  ChatGPT room; contains the `0032` base spec + `0033` binding correction + spec chain + code seams +
  START-HERE + closing handoff 31; 41 files + manifest = 42 entries; 195,431 bytes; SHA-256
  `32D5BFB797896CE34C6BC315833628279577ECAB5546AF0406C0C3B7D1D0FE51`) · 07 2026-07-24 (**round-5 re-review
  package** — built after appending Eli's round-5 8-item correction to `0033`; **full lean working tree**,
  the default convention, since the owner did not request a curated subset this round; contains the updated
  `0033` (with round-5 append) + `0032` + the full `packages/` source the corrections cite + all `_LOGS` +
  `_BLUEPRINTS-TEXT` + migrations/scripts + handoff 32 + CURRENT-STATUS; image/video binaries stripped;
  152 entries; 938,101 bytes (compressed ZIP); SHA-256
  `8A190B1569BA74E9A45038D5509658F3688C85D5BC11A240C18E912CA36AC749`) · 08 2026-07-24 (**round-6 re-review
  package** — built after appending Eli's round-6 6-blocker correction to `0033`; full lean working tree;
  contains the updated `0033` (body + round-5 + round-6) + `0032` + full `packages/` source + all `_LOGS` +
  `_BLUEPRINTS-TEXT` + migrations/scripts + handoff 33 + CURRENT-STATUS; image/video binaries stripped;
  153 entries; 946,814 bytes (compressed ZIP); SHA-256
  `654E30383584A6A5D20BD0AE8954492A3E08BD4D764721E456BABC7D8682AFF7`; recorded on disk post-build) · 09
  2026-07-24 (**round-6 room-transfer UPLOAD package** — the artifact handed to the new Claude Code room +
  the Eli room at the round-6 close; full lean working tree; same round-6 spec content as `08` plus the
  rewritten START-HERE and handoffs 32/33/34; image/video binaries stripped; 154 entries; 952,474 bytes
  (compressed ZIP); SHA-256 `9B892C335CDA7883D59F63F4F50D8CD143F3EB0805482BC03BACDCA8E1E1B657`; recorded on
  disk post-build) · 10 2026-07-24 (**round-7 re-review package** — built after appending Eli's round-7
  6-blocker correction + the seven-status parent/child resume table to `0033`; full lean working tree;
  contains the updated `0033` (body + round-5 + round-6 + round-7) + `0032` + the full `packages/` source
  the round-7 citations rest on + all `_LOGS` (incl. handoff 35, updated LOG-INDEX, registry model-version
  note) + `_BLUEPRINTS-TEXT` + migrations/scripts + CURRENT-STATUS; image/video binaries stripped; metrics
  recorded on disk post-build in `CURRENT-STATUS.md`; **audited PASS by Eli**, produced the round-8
  rejection — 155 entries, 970,159 bytes, SHA-256
  `165E9B7473DFEF75999C3E96B30A9563D0BC7142B48F3F371FE30EACA34B2CBB`) · 11 2026-07-24 (**round-8
  re-review package** — built after appending Eli's round-8 6-blocker correction to `0033`; full lean
  working tree; contains the updated `0033` (body + rounds 5–8) + `0032` + the full `packages/` source +
  all `_LOGS` (incl. handoffs 35/36, updated LOG-INDEX and registry) + `_BLUEPRINTS-TEXT` +
  migrations/scripts + CURRENT-STATUS + the new `PACKAGE-PROVENANCE.md`; image/video binaries stripped;
  metrics recorded on disk post-build in `CURRENT-STATUS.md`; **audited PASS by Eli** — incl. an
  append-only prefix check confirming Update 10's complete `0033` is an exact prefix of `11`'s, `0032`
  byte-for-byte unchanged, and no source changed 10→11 — produced the round-9 rejection; 157 entries,
  986,142 bytes, SHA-256 `204771A8517FE58A63BF1FEAB26CF08216602F5E2A16C3768B3CCF3AA58D4E7C`) · 12
  2026-07-24 (**round-9 re-review + room-transfer package** — built after appending Eli's round-9
  5-blocker correction to `0033`; full lean working tree; contains the updated `0033` (body + rounds 5–9)
  + `0032` + the full `packages/` source + all `_LOGS` (incl. the rewritten START-HERE and handoffs
  35/36/37) + `_BLUEPRINTS-TEXT` + migrations/scripts + CURRENT-STATUS + manifest + provenance;
  image/video binaries stripped; metrics recorded on disk post-build in `CURRENT-STATUS.md`) · 13
  2026-07-27 (**round-10 re-review package** — built after appending Eli's round-10 4-blocker +
  1-documentation correction to `0033`; full lean working tree; contains the updated `0033` (body +
  rounds 5–10) + `0032` + the full `packages/` source the round-10 citations rest on (`jobs/worker.ts`,
  `jobs/create.ts`, `queue/connection.ts`, `queue/queues.ts`, `queue/runtime{,.test}.ts`,
  `providers/routing.ts`, `repair/chunked-repair.ts`) + `migrations/0001_schema.sql` + all `_LOGS` (incl.
  handoffs 38/39, the round-9 relay, updated LOG-INDEX) + `_BLUEPRINTS-TEXT` + CURRENT-STATUS + manifest
  + provenance; image/video binaries stripped; **the three VHE-2 §4.2 verbatim-edit-site options are
  reproduced in `PACKAGE-PROVENANCE.md` exactly as filed in `0033` R10·3**, verified by a
  whitespace-normalised match against `0033` itself; **161 entries · 1,023,617 bytes (compressed ZIP) /
  1,895,082 bytes uncompressed content · SHA-256
  `D98ABFE75FDBFC664D74C40282FF2C8DD9A11EB58377D1FCE18D4F80EF79B61C`**; built at HEAD `241a27c`;
  **45/45 post-build verification checks passed**; metrics recorded on disk post-build in
  `CURRENT-STATUS.md`) · 14 2026-07-27 (**round-11 re-review package** — built immediately after the
  round-11 correction was committed at `d429944` (Eli's explicit gate: no `14` before that commit); full
  lean working tree; contains the updated `0033` (body + rounds 5–11) + `0032` + the full `packages/`
  source the round-11 citations rest on (adds `packages/jobs/errors.ts` to the cited set) +
  `migrations/0001_schema.sql` + all `_LOGS` (incl. handoff 41 and the updated LOG-INDEX/CURRENT-STATUS)
  + `_BLUEPRINTS-TEXT` + manifest + provenance; image/video binaries stripped (same 8, none added);
  **164 entries · 1,049,701 bytes (compressed ZIP) / 1,961,268 bytes uncompressed content · SHA-256
  `5F14F62AF4BFC8DFCB8BC9B1E2E1F8E5100B09752730352E41B1E45CFC20EC8E`**; built at HEAD `d429944`; **31/31
  post-build verification checks passed** (same discipline as `13`'s 45, scoped to what changed:
  round-11 content, provenance, and structural checks — no new binary/path/env class of check was
  needed); built via a Python 3.11 scratchpad script, no tracked packaging script in the repo, per
  established convention). · 15 2026-07-27 (**round-12 re-review package** — built after committing the round-12 append at `9f73cf5`, per Eli's gate; full lean working tree; contains `0033` (body + rounds 5–12), `0032`, the full `packages/` source, `migrations/0001_schema.sql`, all `_LOGS` (incl. handoff 44), `_BLUEPRINTS-TEXT`, CURRENT-STATUS, manifest + provenance; image/video stripped (same 8); **167 entries · 1,078,864 bytes (compressed ZIP) / 2,034,859 bytes uncompressed · SHA-256 `AD95378016F537D167371EEBB7E3E8BADBB658DEEDBFB00D1FAB78CDEACED971`**; built at HEAD `9f73cf5`; **28/28 post-build verification checks passed**. **`PACKAGE-PROVENANCE.md` records that Ashley AUTHORIZED VHE-2 §4.2 option (iii) and that the blueprint `.docx` was deliberately NOT edited** — an earlier build of this same number carried stale round-11 'Eli recommends' wording and was **discarded and rebuilt** before any metric was recorded or shipped; the SHA above is the rebuilt artifact). **Next is 16.** Packages `01`–`04`
  were built directly in the `VHE Backups\` root and later moved by the owner into
  `VHE Backups\VHE FOR Review\` to establish the new location (see above) — `05` on is built there
  directly, no move needed.
- **Note on `05`'s curated form:** the default Progress-update convention is the full lean working tree.
  `05` was, at the owner's explicit direction, a **curated verification subset** scoped to what Eli needs
  to verify `0032`'s claims. This does not change the default convention for future packages — a curated
  subset is done only when the owner asks for one.

---

## Source-of-truth documents (project root)

| Doc | Role | Status |
|---|---|---|
| VHE-1 | Product vision & feature plan — the "what and why" | Stable |
| VHE-2 | Builder execution plan v3 — the "how", §0–§17 work orders | Stable |
| VHE-3 | Pre-flight tools & downloads checklist | Stable |
| VHE-4 | Voice & Audio Layer addendum v1.1 — §A0–§A12 | Stable, additive only |
| VHE-5 | Lip Sync & Dialogue Animation addendum — §B0–§B11 | **ACTIVE — still under revision. Not frozen.** |

**VHE-1 through VHE-4 are intact and are not to be modified.** VHE-5 is additive and may still
receive changes; do not treat it as frozen until the project owner explicitly marks it complete.
Do not replace or contradict the existing architecture unless an authorized revised blueprint
explicitly approves the change.

---

## Core rules (non-negotiable)

- Never overwrite a historical diary entry. Corrections are **appended and signed**, never edited in place.
- Never claim an issue is resolved without verification. State what you actually ran and what it output.
- Never put a large technical investigation inside a short handoff log.
- Never duplicate a full diary entry inside a handoff log — reference it by number.
- Never tell the next builder to read every historical log.
- Always use exact file names and log numbers when referencing prior work.
- Always sign entries with your assigned account identifier and name the platform/room.
- The handoff log must reflect the project's **actual final state** at session end — not what you
  planned or intended to do.
