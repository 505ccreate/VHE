# VHE-ISSUE-LOG-0008  —  Handoff said 7 test fixtures; VHE-2 §1 requires 8

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0008 |
| **Date / time** | 2026-07-19 15:01 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §1 (Pre-Flight, fixture list), VHE-2 §9.4 (Anomaly Auto-Detect) |
| **Category** | Mistake (in a prior log entry) / Discovery |
| **Status** | **RESOLVED** |

---

## 1. What happened

`CURRENT-STATUS.md` (written by this same account at the end of the previous session) instructed the
next builder to "build the 7 test fixtures (VHE-2 §1 list)".

Reading VHE-2 §1 directly this session, the fixture list contains **eight** entries, not seven:

```
fixtures/bad_hand.png          — AI image with 6-finger hand
fixtures/melted_face_15s.mp4   — clip with face degradation mid-clip
fixtures/ntsc_2997.mp4         — 29.97fps (30000/1001), ≥ 300 frames
fixtures/vfr_phone.mp4         — variable-frame-rate phone capture
fixtures/no_audio.mp4          — silent video
fixtures/long_gop.mp4          — keyint=250
fixtures/garbled_text.png      — AI image with unreadable logo text
fixtures/bad_hand_6s.mp4       — short clip with a visibly wrong hand  ← the eighth
```

The eighth, `bad_hand_6s.mp4`, is described in §1 as "video counterpart of bad_hand.png, used by
§9.4". VHE-2's own version header explains why it was missed: v3 "merges the 7-17 patch: adds §9.4
(Anomaly Auto-Detect), §9.5, §10.1". `bad_hand_6s.mp4` arrived **with** that patch. A count of seven
is the count from the pre-patch v2 list.

## 2. Why it matters

The fixture set is not incidental — VHE-2 §1 calls it "the real test suite", and VHE-2 §16 makes
fixture behavior the Phase 0 exit gate. A builder who trusts the handoff builds seven fixtures, runs
a verification script that only knows about seven, and gets an all-green pre-flight that is
**wrong**. §9.4 (Anomaly Auto-Detect) would then reach implementation in Phase 3+ with no fixture to
scan, and the gap would surface as a mysterious missing-file failure weeks downstream, far from the
handoff that caused it.

More broadly: this is an error propagated by a *log*, which is the failure mode this logging system
is supposed to prevent. A summary in a handoff was trusted over the source of truth. That is worth
recording as loudly as a code bug.

## 3. Attempted solutions

1. **Attempt:** Read the fixture list from `CURRENT-STATUS.md` ("the 7 test fixtures") and take the
   count as given, since it was written by the same account one session earlier.
   **Result:** Would have produced an incomplete fixture set. Not done — the count was cross-checked
   against the blueprint before any fixture work started, per the project rule that blueprints, not
   logs, are the source of truth.
2. **Attempt:** Count the fixture list in `_BLUEPRINTS-TEXT/VHE-2_...md` lines 29–36.
   **Result:** Eight entries. Confirmed `bad_hand_6s.mp4` is the extra one and is tied to §9.4.
3. **Attempt:** Explain the discrepancy rather than just correct it — checked VHE-2's version header
   for whether the list changed between versions.
   **Result:** Confirmed. Line 12 of the mirror records that v3 merged the 7-17 patch adding §9.4.
   The seven-count is a stale v2-era number, not a simple miscount.

## 4. Resolution

The fixture count for this project is **8**. Corrections applied this session:

- `scripts/preflight.ts` — `FIXTURES` array contains all eight, with an inline comment naming this
  entry and explaining why the eighth exists. The script prints the count it is enforcing
  (`8 required by VHE-2 §1`) so a wrong count can never be silent again.
- `CURRENT-STATUS.md` — corrected from "7 test fixtures" to 8 at session end.

Note for the next builder: the *count* is settled, but the fixtures are **not built** and cannot all
be built in this room. That is a separate problem — see `VHE-ISSUE-LOG-0009`.

## 5. Verification

Verified by direct read of the VHE-2 §1 fixture list (mirror lines 29–36) — eight entries counted
individually, listed in §1 above.

Verified in running code: `node --experimental-strip-types scripts/preflight.ts` printed
`[c] Test fixtures (8 required by VHE-2 §1)` followed by exactly eight rows. Actual output captured
in `VHE-ISSUE-LOG-0010` §5.

Per VHE-2 §0, the authoritative text is the `.docx`, not the mirror. This correction changes no code
block and copies nothing verbatim — it is a count of filenames, which the lossy extraction preserves
reliably — so the mirror is sufficient evidence here. A builder writing fixture-generation code
should still open the original `.docx` for the exact spec of each fixture.

## 6. Affected files / components / tests / commits

- `scripts/preflight.ts` — `FIXTURES` array; created this session with all 8
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — count corrected 7 → 8
- Blueprint section: VHE-2 §1 (fixture list), §9.4 (the consumer of the eighth fixture)
- Test: pre-flight run — 8 fixture rows reported, all FAIL (not built). Correct behavior.

## 7. Prevention

**The general lesson: never restate a blueprint's contents as a number in a handoff log.** A count is
a lossy summary that cannot be checked without reopening the source. Handoffs should point at the
section ("build the VHE-2 §1 fixture list") and let the builder read it, exactly as the README
already requires for code blocks.

**The mechanical fix, already in place:** `scripts/preflight.ts` is now the single enforcement point
for the fixture set. It prints the count it enforces, and a missing fixture is a hard FAIL that
closes the Phase 0 gate. The list lives in one place in code rather than being re-summarized in prose.

**Harvest candidate:** the pattern of "verification script prints the count it is enforcing" is worth
carrying into other checklist-driven gates. A silent all-green over an incomplete set is the
dangerous case; a printed count makes the set auditable at a glance.

## 8. Related entries

- `VHE-ISSUE-LOG-0009` — the fixtures cannot actually be built in this room; the blocker
- `VHE-ISSUE-LOG-0010` — the pre-flight script this correction is enforced in
- `VHE-ISSUE-LOG-0004` — the `_BLUEPRINTS-TEXT/` mirror used to catch this, and its lossiness caveat

---

## Appended corrections

_(none)_
