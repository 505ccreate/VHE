# VHE Handoff — 2026-07-23-24 — owner ruling on removal lane (0028), session ending on time budget

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 |
| **Session window** | 2026-07-23 evening EDT — ending on time/usage budget (session ~83% used, ~1hr25min to reset) |
| **Purpose** | Record owner's ruling on `VHE-ISSUE-LOG-0028` §5, close out logs, produce the two review/backup zips. **No code changed, no fixes attempted this session per owner instruction (avoid mid-work session death).** |
| **HEAD** | `52e3277` (unchanged) |

## What happened

Owner reviewed `VHE-ISSUE-LOG-0028` (the video-removal-lane comparison from the prior entry this
session) and ruled on all 5 open questions. Recorded as an **appended correction** to 0028 (§7a) per
protocol — the original body is frozen, corrections go at the bottom, signed/dated.

**Ruling summary** (full text in `VHE-ISSUE-LOG-0028` §7a):
1. Build **fal VOID** first, for removal only. Wan VACE reserved for content-replacement. Replicate
   ProPainter not integrated now.
2. Register VOID under the **existing** `video.inpaint` capability — no new enum, no §7 union edit.
   Distinguish removal via manifest metadata or `extra.operation = "remove"`.
3. Determinism: seedless output is OK as *provider* variability only — **pipeline must cache/reuse the
   returned artifact, retries must not re-call the provider, and full lineage (model/version, source
   hash, mask hash, params, asset) must be recorded.** This is a NEW requirement — no existing module
   has a lineage record shape yet. Flagged for whoever builds this.
4. A **strictly zero-spend** metadata/schema probe of VOID is authorized. No media submission, no
   inference, nothing that could charge. Stop and ask if cost is ever uncertain.
5. Mask-video encoder approved as prerequisite, but **gated**: a separate additive removal-lane spec
   (fps/dims/frame-count/alignment, mask polarity/pixel format, wrapper-only plan, golden-test plan)
   must be written and logged **before** any encoder/adapter/test code is written.

**Nothing was implemented this session** — owner explicitly instructed: update logs, produce the two
zips, do NOT attempt any fixes/build work, because remaining session time won't survive it.

## What I did this session (in order)
1. Read `CURRENT-STATUS.md` + newest handoffs (21, 22) + `VHE-ISSUE-LOG-0027` + `SESSION-PROTOCOL.md`
   per the mandatory session-start sequence. Confirmed identifier `CC-OPUS-01` in the registry.
2. Per owner's four fixture-independent directives, wrote `VHE-ISSUE-LOG-0028` (removal-lane
   comparison), claimed/indexed it, wrote handoff-23 for that half.
3. Owner returned the §5 ruling; appended it to 0028 §7a (this handoff records that ruling landed).
4. **This handoff (24)** + `CURRENT-STATUS.md` update + the two zips (below) close the session.

## Verified state
- Suite / preflight **unchanged since 0027**: 153/153, preflight 13/4/1. Not re-run — no code touched
  this session (memo + logging + zips only).
- HEAD still `52e3277`. Working tree: the untracked Higgsfield docx (pending owner decision, unchanged)
  + this session's new/modified logs.

## Next action (in strict order — for the next room/session)
1. **First build task:** the **separate additive removal-lane specification** required by ruling #5 —
   mask.mp4 encoder shape, fps/dims/frame-count/alignment, VOID's mask polarity/pixel format, §6
   wrapper-only plan, golden tests. Log it, get it reviewed, THEN build.
2. Only after that spec: the zero-spend VOID limits probe (ruling #4), the mask encoder, a mock VOID
   adapter, routing tests, the caching/retry-dedup + lineage recording ruling #3 requires — all against
   synthetic/no-spend fixtures. **Still no live inference, no spend, authorized by this ruling.**
3. Unchanged standing items: the 4 frozen §1 fixtures + concrete `S3_REGION` (blocks live fal
   `image.inpaint` validation, separate from the removal-lane work).
4. Two zips for this session are being produced now (see below) — next room should find them in
   `VHE Backups\`.

## Warnings (unchanged)
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via §6 wrapper — applies doubly to the mask-video
  encoder ruling #5 requires.
- `.env` KEK; Python `py -3.11`; never scan `library/tools/`; never echo live keys.
