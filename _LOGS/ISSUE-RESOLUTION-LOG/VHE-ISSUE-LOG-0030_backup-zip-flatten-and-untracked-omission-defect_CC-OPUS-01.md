# VHE-ISSUE-LOG-0030 — Backup/review zip defect: directory flatten + untracked-file omission

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0030 |
| **Date / time** | 2026-07-24 (morning EDT) |
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | N/A — packaging/tooling defect in this session's own backup routine, not a VHE-2/VHE-5 code section |
| **Category** | Mistake — discovered during owner-requested verification before sending a review package |
| **Status** | **RESOLVED** |

---

## 1. What happened

The owner asked me to confirm, before sending `VHE-CONTEXT-FOR-ELI_2026-07-24.zip` (since renamed
`VHE-Progress-update 01_2026-07-24.zip`) to an outside reviewer, that it preserved folder structure and
contained specific files (`0028`, `0029`, the current handoffs, `_IN-PROGRESS_CC-OPUS-01.md`,
`LOG-INDEX`, `CURRENT-STATUS`). Checking, rather than assuming, found two real defects in **both** zips
built earlier this session (`VHE-BACKUP-FULL_v06_2026-07-24.zip` and the first
`VHE-Progress-update 01` build):

1. **Directory structure was completely flattened.** Both zips were built with
   `Compress-Archive -LiteralPath $arrayOfRelativeFilePaths -DestinationPath out.zip`. PowerShell's
   `-LiteralPath` with an array of individual file paths adds each file as a **top-level** zip entry
   named only by its leaf filename — it does not preserve the source directory tree. Every entry in both
   zips was a bare filename with zero path separators.
2. **A real silent collision from (1):** two files in this project are both named `README.md` —
   `_LOGS/README.md` and `fixtures/_TEMP-provider-validation/README.md`. When flattened to the zip root,
   the second write **silently overwrote** the first under the identical entry name `README.md`. This is
   confirmed data loss inside the delivered zip, not a hypothetical.
3. **Separately, the file list itself was incomplete.** The zip-building method took `git ls-files`
   (tracked files) plus exactly one hardcoded untracked exception (the Higgsfield `.docx`). Every other
   untracked file — `VHE-ISSUE-LOG-0028`, the newly-written `VHE-ISSUE-LOG-0029`, all four same-session
   handoff logs (`21`–`24`), and the live `_IN-PROGRESS_CC-OPUS-01.md` — was silently absent from both
   zips, because none of them had been `git add`ed at the time of packaging.

## 2. Why it matters

The full backup (`v06`) is supposed to be the authoritative point-in-time copy of the working tree —
item (1)+(2) mean it silently lost `_LOGS/README.md` content (or the fixture README, depending on
enumeration order — not verified which one survived, and it does not matter: **both should exist and
only one did**). Item (3) means the backup was also missing this session's actual work product (the
removal-lane ruling record and the spec it gates). A "backup" that silently drops files on both axes
defeats the purpose of the backup routine. The review zip (about to go to an outside AI reviewer) had
the identical defects — the reviewer would have seen a flattened, incomplete package and had no way to
know content was missing.

## 3. Attempted solutions

1. **Attempt:** Trusted the original `Compress-Archive -LiteralPath` approach (used for `v01`–`v06` and
   the first review zip) without inspecting zip internals.
   **Result:** Worked by coincidence for `v01`–`v05` only in the sense that no one had checked; the same
   defect class was latent the whole time. Only surfaced when explicitly asked to verify structure +
   contents before an external send.
2. **Attempt:** Re-check zip entries for `/`-style path separators after the owner's request.
   **Result:** False negative at first — Windows `Compress-Archive` zip entries use `\` not `/`; the
   initial verification query used the wrong separator and appeared to still show a flat archive even
   after switching methods. Corrected by dumping raw entry names and re-testing with `\`.
3. **Resolution below** — staged-directory build, verified with the correct separator.

## 4. Resolution

- Built the full source file list as `git ls-files` **plus an explicit list of every currently-untracked
  file that should be in the package** (not a single hardcoded exception): the Higgsfield docx, `0028`,
  `0029`, handoffs `21`–`24`, and `_IN-PROGRESS_CC-OPUS-01.md`.
- **Staged** that file list into a temp directory tree that mirrors the real relative paths (`mkdir -p
  $(dirname f); cp f staged/f` per file), then zipped the **staged directory** with
  `Compress-Archive -Path "<stagedDir>\*" -DestinationPath out.zip` — compressing a directory (vs. an
  array of individual `-LiteralPath` files) correctly preserves the relative tree.
- Rebuilt the full backup as `VHE-BACKUP-FULL_v07_2026-07-24.zip` (147 files: 139 tracked + 8 untracked
  additions). The defective `v06` was **renamed** (not deleted — I built it this session, so it was
  mine to fix, but the record stays) to
  `VHE-BACKUP-FULL_v06_2026-07-24_DEFECTIVE-FLATTENED-DO-NOT-USE.zip` so its SHA-256 already quoted in
  `CURRENT-STATUS.md`'s prior text is never mistaken for a valid current backup.
- Rebuilt `VHE-Progress-update 01_2026-07-24.zip` in place (139 lean files, binaries stripped, same
  8-file exclusion list as before) plus a new `EXCLUDED-BINARIES-MANIFEST.md` inside the zip listing
  each excluded file's original path, size, and SHA-256 (owner's traceability request).
- Added `_LOGS/README.md` to the source set (it's tracked, so it was always going to be included) —
  confirmed present alongside the fixture README with no collision this time.

## 5. Verification

Ran directly against the rebuilt zips via `System.IO.Compression.ZipFile`:
- `VHE-Progress-update 01_2026-07-24.zip`: 140 entries (139 files + the new manifest). All of
  `_LOGS\ISSUE-RESOLUTION-LOG\VHE-ISSUE-LOG-0028_*.md`, `..._0029_*.md`, the 4 handoff files,
  `_LOGS\STATUS-HANDOFF\_IN-PROGRESS_CC-OPUS-01.md`, `_LOGS\LOG-INDEX.md`,
  `_LOGS\STATUS-HANDOFF\CURRENT-STATUS.md`, `_LOGS\README.md`,
  `fixtures\_TEMP-provider-validation\README.md`, and `EXCLUDED-BINARIES-MANIFEST.md` confirmed present
  by exact entry-path match. Zero `.env` matches. Zero leftover binary-extension entries. SHA-256
  `93D4CF286A27A0B694AAD89DCAA4D531944290A5AA0D05C25D32CF2DD675B339`.
- `VHE-BACKUP-FULL_v07_2026-07-24.zip`: 147 entries. Both `README.md` files present at their distinct
  paths (no collision). Zero `.env` matches. SHA-256
  `87810B4311A3261196C79B619676CFF131A4587526C007B36052EBF46BA2C25A`.

## 6. Affected files / components / tests / commits

- No source code affected — this is a packaging-tooling defect in ad hoc PowerShell run this session,
  not a file in the repo.
- `VHE Backups\VHE-BACKUP-FULL_v06_2026-07-24_DEFECTIVE-FLATTENED-DO-NOT-USE.zip` — superseded, kept for
  the record.
- `VHE Backups\VHE-BACKUP-FULL_v07_2026-07-24.zip` — corrected full backup.
- `VHE Backups\VHE-Progress-update 01_2026-07-24.zip` — corrected review package + manifest.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — updated to point at `v07` / corrected `Progress-update 01`.
- `_LOGS/README.md` — the backup-routine section did not itself say how to build the zip (no `-Literal
  Path` recipe was written into it), so no correction needed there; nothing in the permanent doc was
  wrong, only this session's ad hoc execution.

## 7. Prevention

- **Never build a project zip with `Compress-Archive -LiteralPath <arrayOfFiles>`.** Always stage into a
  directory that mirrors the real relative paths first, then compress the directory
  (`Compress-Archive -Path "<dir>\*"`), or use `System.IO.Compression.ZipArchive` and set each entry's
  name explicitly to its relative path. This is the harvest candidate for the Soren Tools Library: a
  small reusable "zip a git-tracked-plus-extras file list, preserving structure" helper script, so this
  class of bug can't recur by hand-rolling the PowerShell each time.
- **Any future backup/review-zip build must explicitly enumerate untracked files to include** — never
  assume `git ls-files` alone is the source of truth for what "the current work" is, since active session
  logs are deliberately written before being `git add`ed.
- **Verify zip entries with the platform-correct path separator** (`\` on Windows `Compress-Archive`
  output) — the first verification attempt in this session gave a false negative by checking for `/`.

## 8. Related entries

- `VHE-ISSUE-LOG-0029` — the removal-lane spec this review package exists to carry to outside review;
  was one of the files silently omitted by this defect.
- `_LOGS/README.md` — "Backup routine" / "Review/context packages (Progress-update series)" sections;
  unaffected in content, just executed incorrectly this session.

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

### 2026-07-24 (afternoon EDT) — Eli package audit: sent package reconciled + two forward-looking conventions. `CC-OPUS-01`.

Eli audited the uploaded review package and reported it **healthy** (no `.env`, only `.env.example`;
the 8 PNG/MP4 binaries excluded; all logs 0001–0029, CURRENT-STATUS, LOG-INDEX,
`_IN-PROGRESS_CC-OPUS-01.md`, handoffs 21–24, wrappers/adapters/storage/job-lifecycle/tests present).
Three reconciliation/convention points, all now resolved or logged:

1. **Identity reconciled.** The owner renamed the corrected review zip `01 → 02` before uploading (the
   new climbing-number convention avoids the duplicate-name rejection some AI platforms give identical
   filenames). Verified on disk: `VHE-Progress-update 02_2026-07-24.zip` is **842,537 bytes** (= Eli's
   reported size) and **byte-identical** to the corrected build — SHA-256
   `93D4CF286A27A0B694AAD89DCAA4D531944290A5AA0D05C25D32CF2DD675B339`, **140 entries** (139 lean files +
   `EXCLUDED-BINARIES-MANIFEST.md`). `Progress-update 01` no longer exists on disk (it WAS this same
   file). **The "132 files" Eli saw referenced in the internal logs was the DEFECTIVE first build's
   count** (§1 above); the corrected build that became `02` has 140 entries. CURRENT-STATUS updated to
   describe `02` as the current package.
2. **Known cosmetic discrepancy in the AS-SENT `02` (cannot change without a re-cut/re-send):** its
   internal `EXCLUDED-BINARIES-MANIFEST.md` title still reads "Progress-update 01" — it was generated
   before the owner's rename. The bytes Eli audited are frozen; I did **not** silently rebuild-and-swap
   them (that would orphan Eli's audit). **New convention (logged in `_LOGS/README.md`): a package's
   internal manifest MUST name the package/file it ships in.** If the owner wants a clean re-cut
   (correct internal name), that becomes `Progress-update 03` — offered, not auto-produced.
3. **Portability (forward-looking):** `Compress-Archive` on Windows PowerShell writes zip entries with
   **backslash** separators and no explicit directory entries — recognizable on Windows but not clean
   for standard Linux `unzip`. **New convention (logged): future packages use forward-slash zip paths.**
   Implementation note for whoever builds the next one: `Compress-Archive` cannot emit forward slashes —
   use `System.IO.Compression.ZipArchive` with each entry's name set explicitly to its
   forward-slash relative path (or `git archive` for the tracked subset + a second pass for untracked
   additions). This is the concrete follow-up to §7's "reusable structure-preserving zip helper."

No code, no probe, no spend in this correction — records/conventions only.
