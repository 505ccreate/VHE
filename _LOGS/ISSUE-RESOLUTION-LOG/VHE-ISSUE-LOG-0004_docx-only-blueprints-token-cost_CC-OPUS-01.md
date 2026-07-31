# VHE-ISSUE-LOG-0004  —  Blueprints are .docx-only: not greppable, re-extracted every session

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0004 |
| **Date / time** | 2026-07-19 12:42 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | N/A — affects access to all of VHE-1 through VHE-5 |
| **Category** | Unexpected behavior / Operational inefficiency |
| **Status** | **RESOLVED** — 2026-07-19, owner authorized; `_BLUEPRINTS-TEXT/` mirror + regeneration script created (see Appended corrections) |

---

## 1. What happened

All five source-of-truth blueprints are `.docx` files. A `.docx` is a ZIP archive containing XML, so:

- Text-search tools (grep / ripgrep) return nothing useful against them.
- File-read tools cannot open them as text.
- Every AI builder on every platform must extract them before reading a single line.

Two of the filenames additionally contain double spaces and an `=` character
(`VHE-1 Ai Hallucition Video Repair Plan.md  7-10=2026 505ccreate.docx`), and confusingly carry a
`.md` in the middle of a `.docx` filename. These break naive path handling and shell globbing, and
the embedded `.md` invites a builder to assume the file is markdown when it is not.

`python-docx` is not installed on this machine, so the standard extraction path was unavailable.

## 2. Why it matters

This is a **recurring per-session tax paid by every builder on every platform**, and it works
directly against the stated goal of reducing token usage across rooms:

- Every new room re-extracts ~140,000 characters of blueprint before it can do anything.
- VHE-2 §0 requires code blocks be copied **verbatim**. Text extracted by stripping XML tags loses
  code-block boundaries, indentation, and table structure. A builder copying "verbatim" from a lossy
  extraction is not copying verbatim — this is a live correctness risk, not just an efficiency one.
- Targeted lookups are impossible. A builder that needs only VHE-2 §6.4 must extract the whole
  49,871-character document to find it. Multiply across sessions and platforms.
- Some platforms and rooms may lack a scripting tool capable of extraction at all, and would be
  unable to read the source of truth without the owner pasting content manually.

## 3. Attempted solutions

1. **Attempt:** Direct read of the `.docx` files as text.
   **Result:** Failed as expected — binary ZIP container.
2. **Attempt:** `python-docx` (`import docx`).
   **Result:** `ModuleNotFoundError: No module named 'docx'`. Not installed. Installing a package
   into the user's Python environment was **not** done — an unrequested environment change is out of
   scope for a logging-setup session.
3. **Attempt:** Wrote a dependency-free extractor using the standard library only —
   `zipfile` to pull `word/document.xml`, regex to convert `</w:p>` to newlines and strip tags,
   then unescape XML entities.
   **Result:** **Worked.** All five documents extracted successfully:

   | Document | Extracted size |
   |---|---|
   | VHE-1 | 8,583 chars |
   | VHE-2 | 49,871 chars |
   | VHE-3 | 3,433 chars |
   | VHE-4 | 23,693 chars |
   | VHE-5 | 54,197 chars |

   Output written to the session scratchpad — which is **ephemeral and lost when this session ends.**
4. **Attempt:** Initial extraction wrote files using an unsanitized name mapping; a subsequent read
   failed because `=` in the VHE-1 filename had been rewritten to `_`.
   **Result:** Minor, self-corrected by listing the output directory rather than assuming names.
   Recorded because it is a concrete example of the filename-hygiene problem in §1.

## 4. Resolution

**Partially resolved.** The extraction works and is reproducible, but its output is ephemeral and the
next session will pay the same cost again.

**Recommended permanent fix — requires owner approval before any builder does it:**

Create a `_BLUEPRINTS-TEXT/` folder in the project root holding a plain-text or markdown mirror of
each document, generated once and committed alongside the originals.

- The `.docx` files remain the **authoritative source**. The mirror is a read-optimized convenience
  copy, clearly labeled as such at the top of every file.
- Any builder needing verbatim code blocks still consults the original `.docx`, because the mirror is
  lossy for formatting. This must be stated in the mirror header.
- The mirror must be regenerated whenever a blueprint changes — **especially VHE-5, which is still
  active.** A stale mirror is worse than no mirror: it is a source of drift. If the mirror cannot be
  kept in sync reliably, do not create it.

That last risk is real enough that this is written as a recommendation rather than an action.
The owner should decide, since it trades a per-session token cost against a staleness risk.

**Not recommended:** converting the blueprints to markdown and discarding the `.docx` originals.
That would modify VHE-1 through VHE-4, which are to be kept intact.

## 5. Verification

Extraction script verified by running it against all five documents — all five produced non-empty,
readable output at the character counts listed above, and the content was successfully used to write
`VHE-ISSUE-LOG-0001` through `0003` this session.

**The recommended permanent fix is UNVERIFIED — it has not been implemented.** No `_BLUEPRINTS-TEXT/`
folder was created, and no blueprint file was modified, moved, or renamed.

## 6. Affected files / components / tests / commits

- All five `VHE-*.docx` files — **read only, none modified**
- Extraction script — written to session scratchpad, ephemeral, not part of the project
- No project files created by this entry

## 7. Prevention

Two recommendations for the owner:

1. **Filename hygiene for future blueprints.** No double spaces, no `=`, no misleading secondary
   extensions like `.md` inside a `.docx` name. The VHE-2, VHE-4, and VHE-5 names are already clean —
   VHE-1 and VHE-3 are the offenders. Renaming those two is safe (nothing references them but this
   log) but is still an owner decision.
2. **Decide the `_BLUEPRINTS-TEXT/` question once**, and record the answer as an appended correction
   here, so the next five rooms do not each independently rediscover this problem and each spend
   tokens solving it again.

The reusable extractor itself is a candidate for the Soren Tools Library at project end — it is
dependency-free and works on any machine with Python.

## 8. Related entries

- `VHE-ISSUE-LOG-0001` — project state audit, first encountered this
- `VHE-ISSUE-LOG-0002` — VHE-5 version mismatch; a text mirror under version control would make such
  discrepancies diffable and obvious

---

## Appended corrections

**2026-07-19 14:30 EDT — `CC-OPUS-01` — RESOLVED. Permanent fix implemented with owner authorization.**

1. **`_BLUEPRINTS-TEXT/` created** in the project root: one `.md` mirror per blueprint, each
   headed by a warning block stating the `.docx` is authoritative, the extraction is lossy, and
   verbatim code blocks must come from the original.
2. **`_BLUEPRINTS-TEXT/_regenerate.py`** — stdlib-only regeneration script (the §7 "reusable
   extractor", now a project file instead of ephemeral scratchpad). One command rebuilds the whole
   mirror and deletes orphaned mirrors of renamed/removed blueprints:
   `python _BLUEPRINTS-TEXT/_regenerate.py`
3. **Verified:** script run 2026-07-19 13:05 EDT — all 5 documents extracted (8,581 / 49,871 /
   3,431 / 23,693 / 54,196 chars), header block confirmed present in output.
4. **Filename hygiene applied** (§7 recommendation 1): VHE-1 and VHE-3 renamed to clean names —
   see `VHE-ISSUE-LOG-0002` Appended corrections for the exact mapping.
5. **Staleness rule now binding:** whoever changes any blueprint — above all VHE-5, which is still
   active — reruns the script in the same session and says so in their handoff. A mirror whose
   extraction date predates a blueprint's modification date must be treated as stale and
   regenerated before use.
