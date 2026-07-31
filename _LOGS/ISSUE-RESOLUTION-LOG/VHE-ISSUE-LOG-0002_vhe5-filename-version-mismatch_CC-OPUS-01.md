# VHE-ISSUE-LOG-0002  —  VHE-5 filename says v1.0, document contents say v1.1

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0002 |
| **Date / time** | 2026-07-19 12:38 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-5 header, §B1, §B2, §B4.5, §B4.6, §B6, §B8, §B9, §B10, §B11 |
| **Category** | Discovery / Version-control risk |
| **Status** | **RESOLVED** — 2026-07-19, owner authorized; file renamed to v1_1 (see Appended corrections) |

---

## 1. What happened

The VHE-5 file on disk is named:

```
VHE-5_Lip_Sync_and_Dialogue_Animation_Addendum_v1_0_7-19-2026.docx
```

The filename asserts **v1_0**. The document's own header line asserts something different:

> "Addendum module to the VHE-2 Execution Plan · v1.1 · July 19, 2026 (v1.1 adds Track C —
> provider-assisted unrigged stylized-character lip sync: §B1 mode enum, §B2 schema fields, §B4.5,
> §B4.6 path resolver, §B6 Signal F extensions, §B8 UI, §B9 fixtures, §B10 tests 16–24, §B11 phase B-2b)"

So the contents are **v1.1** and include an entire additional track (Track C) that a v1.0 document
would not contain. The file was evidently updated in place without renaming.

## 2. Why it matters

This is exactly the condition that produces cross-platform drift, and it is dangerous in three
distinct ways:

1. **A builder that trusts the filename will believe Track C does not exist.** Track C covers
   unrigged animated footage — a whole capability path with its own schema fields, path resolver,
   Signal F extensions, UI, fixtures, and tests 16–24. Missing it means building an incomplete B-2b
   phase.
2. **Version references become ambiguous.** If a future handoff log says "per VHE-5 v1.0," no one can
   tell whether that means the file (which contains v1.1 content) or genuine pre-Track-C v1.0
   content. Ambiguous version references in a multi-platform project are how contradictory
   implementations get built in parallel.
3. **VHE-5 is explicitly still active and unfrozen.** More revisions are expected. If v1.1 was
   written into a file named v1_0, v1.2 may well be written into the same file, compounding the
   problem and silently destroying the ability to diff revisions.

Note the contrast: VHE-4's filename **does** correctly carry `v1.1` and its header matches. The
convention exists and is being followed elsewhere — VHE-5 is the outlier.

## 3. Attempted solutions

1. **Attempt:** Extracted and read the VHE-5 document header and section list to confirm the
   discrepancy was real and not an artifact of text extraction.
   **Result:** Confirmed. The header explicitly says v1.1 and enumerates the Track C additions.
   Section grep confirms §B4.5, §B4.6, and Track C references are present in the body.
2. **Attempt:** Cross-checked VHE-4 for the same pattern.
   **Result:** No discrepancy. `VHE-4_..._v1.1_7-18-2026.docx` matches its header's "v1.1".
   The naming convention is otherwise sound.
3. **Considered:** Renaming the file to `..._v1_1_...` to match its contents.
   **Not done.** Renaming a source-of-truth blueprint is an owner decision, not a builder decision.
   Any external reference, link, or prior handoff pointing at the current filename would break.
   Logged and deferred rather than acted on — per the no-pivot rule in `SESSION-PROTOCOL.md`.

## 4. Resolution

**Not resolved. Deferred to the project owner.** Three options, in recommended order:

1. **Rename the file to `VHE-5_Lip_Sync_and_Dialogue_Animation_Addendum_v1_1_7-19-2026.docx`.**
   Cheapest fix, matches the VHE-4 convention, and no code or logs currently reference the old name
   except this entry. Recommended.
2. Leave the filename and add an explicit note where builders will see it. Weaker — filenames are
   what a builder reads first when scanning a directory.
3. If the intent was that Track C is *provisional* and not yet part of the official v1.0 spec, then
   the ambiguity is substantive rather than clerical, and the owner needs to state explicitly whether
   Track C is in scope for build.

**Until this is settled, every builder must treat the contents of the VHE-5 file as authoritative
over its filename, and must reference it as "VHE-5 (file dated 7-19-2026, header v1.1)" rather than
by version number alone.**

## 5. Verification

Discrepancy verified by direct extraction of `word/document.xml` from the `.docx` and reading the
header paragraph verbatim, plus a section-heading grep confirming §B4.5/§B4.6/Track C are present in
the body. Filename verified by directory listing.

No file was renamed or modified. **The resolution itself is unverified because no resolution has been
applied.**

## 6. Affected files / components / tests / commits

- `VHE-5_Lip_Sync_and_Dialogue_Animation_Addendum_v1_0_7-19-2026.docx` — **not modified**
- Affects any future work on VHE-5 §B11 phase B-2b (Track C) and tests 16–24
- No code affected — none exists yet

## 7. Prevention

Adopt a hard rule for blueprint documents: **the version in the filename and the version in the
document header must always match, and any content change bumps both.** VHE-5 is still under active
revision, so this will recur on the next edit unless the rule is stated somewhere the owner sees it.

A stronger long-term fix: put the blueprints under version control so revisions are diffable and the
filename stops being the versioning mechanism. See `VHE-ISSUE-LOG-0004`.

## 8. Related entries

- `VHE-ISSUE-LOG-0001` — project state audit, where this was found
- `VHE-ISSUE-LOG-0004` — `.docx` source format and version-control recommendation

---

## Appended corrections

**2026-07-19 14:30 EDT — `CC-OPUS-01` — RESOLVED via option 1.**
Owner authorized correcting the found problems. File renamed:
`VHE-5_..._v1_0_7-19-2026.docx` → `VHE-5_Lip_Sync_and_Dialogue_Animation_Addendum_v1_1_7-19-2026.docx`.
Contents untouched (byte-identical, only the name changed). Verified by directory listing.
In the same operation, VHE-1 and VHE-3 were renamed for filename hygiene (per
`VHE-ISSUE-LOG-0004` §7): now `VHE-1_Product_Vision_and_Feature_Plan_7-10-2026.docx` and
`VHE-3_PreFlight_Tools_Checklist_7-10-2026.docx`. Any pre-2026-07-19 reference to the old
filenames should be read against this note. The filename=header version rule from §7 now applies
to all future blueprint revisions. **VHE-5 remains active and unfrozen** — the rename does not
change that.
