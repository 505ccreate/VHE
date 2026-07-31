# VHE Handoff — 2026-07-24-25

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-24 ~07:40 – ~afternoon EDT |
| **Project phase** | Removal-lane spec gate (VHE-2 §9.2 removal path), pre-Phase-0-exit-gate housekeeping |

**Keep this file short. Detail belongs in the numbered diary entries. Reference them by number.**

---

**Blueprint sections followed:** VHE-2 §9.2 (removal path), §7 (routing), §6 (FFmpeg wrapper), §5 (mask
format) — spec/review only, no code written against any of them this session.

**Current working state (one paragraph, factual):** HEAD unchanged at `52e3277` — **zero code changed
this entire session.** The session was: (1) full-project backup + review-package packaging, (2) writing
the removal-lane spec `VHE-ISSUE-LOG-0029` (the gated deliverable required before any removal-lane
build), (3) discovering and fixing a real zip-flattening/omission defect in the backup tooling
(`VHE-ISSUE-LOG-0030`), (4) sending the corrected review package to Eli for cross-review, and (5)
receiving and recording Eli's review of both the package and the 0029 spec as a signed correction.
**Session is now PAUSED waiting on Eli's answer to two open design questions** (posed in chat this
session, not yet logged as a diary entry — see below) before the revised 0029 spec can be finalized.

**Completed this session:**
- Full-project backup rebuilt correctly as `VHE-BACKUP-FULL_v07_2026-07-24.zip` (147 files, real
  directory structure, SHA-256 verified) after `v06` was found flattened/defective (`0030`).
- Wrote `VHE-ISSUE-LOG-0029` — the additive removal-lane specification required by `0028` §7a ruling #5
  (mask.mp4 encoder shape, fps/dims/frame-count/alignment, VOID polarity/pixel-format unknowns,
  §6-wrapper-only plan, golden-test plan, capability mapping, caching/lineage record shape).
- Discovered + fixed a packaging defect (`0030`): `Compress-Archive -LiteralPath <fileArray>` silently
  flattens directory structure and had caused a real collision (`_LOGS/README.md` vs
  `fixtures/_TEMP-provider-validation/README.md`); the same method also omitted every untracked file
  except one hardcoded exception, dropping `0028`/`0029`/handoffs-21–24/`_IN-PROGRESS` from the zips.
- Sent the corrected review package (`VHE-Progress-update 02_2026-07-24.zip` — owner renamed `01→02`
  before upload) to Eli. **Eli's package audit: healthy**, all required files confirmed present.
- **Eli's removal-lane review returned 14 required revisions to `0029`** — appended as a signed
  correction (not a rewrite of the filed body). Verified Eli's code-level claims directly against
  `52e3277` before accepting them (all confirmed: registry keyed by slug only, execution context can't
  persist a provider-ready mask, S3 store mis-types extensionless video output, `manifestSatisfies` has
  no fps filter, `providerJobId` is only in-memory). **`0029` status: NOT ready for implementation.**
- Owner's direct ruling (relaying Eli): revise the spec first and stop for re-review; run ONLY the
  zero-spend probe second, only after explicit owner approval of key/network use; build the encoder
  third. No implementation or provider action authorized.
- Posed two open design questions back to Eli (via the owner, in chat — NOT yet in a log file): (1) for
  item 4 (adapter registry collision), does Eli prefer one multi-capability fal adapter vs. a
  slug+capability-keyed registry, or is it purely an implementation call; (2) for item 9 (a mask missing
  inside `[a..b]`), does Eli endorse a specific fallback (hold-last-tracked-frame / interpolate) or
  should the spec just say hard-fail for now.

**Tested — with actual results:**
- No tests run this session — no code was touched. Suite/preflight remain at the last-verified state:
  **153/153, preflight 13/4/1** (unchanged since `0027`, HEAD `52e3277`).

**Files created or changed:**
- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0029_removal-lane-mask-video-spec_CC-OPUS-01.md` — created,
  then a signed correction appended (Eli's 14-item review).
- `_LOGS/ISSUE-RESOLUTION-LOG/VHE-ISSUE-LOG-0030_backup-zip-flatten-and-untracked-omission-defect_CC-OPUS-01.md`
  — created, then a signed correction appended (package-audit reconciliation + 2 new conventions).
- `_LOGS/LOG-INDEX.md` — claimed 0029/0030, updated 0029's status twice.
- `_LOGS/README.md` — added the permanent "Backup routine" section and the "Progress-update series"
  review-package convention (naming, retention, structure/portability, internal-manifest-must-match-name
  rules).
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — overwritten repeatedly through the session; final state
  reflects the revise-0029-first gate and the Eli-audited `Progress-update 02` package.
- `VHE Backups\VHE-BACKUP-FULL_v06_2026-07-24_DEFECTIVE-FLATTENED-DO-NOT-USE.zip` — renamed from `v06`
  (kept, not deleted, flagged defective).
- `VHE Backups\VHE-BACKUP-FULL_v07_2026-07-24.zip` — created (corrected full backup).
- `VHE Backups\VHE-Progress-update 02_2026-07-24.zip` — created/corrected, then renamed `01→02` by the
  owner before sending to Eli (SHA-256 `93D4CF286A27A0B694AAD89DCAA4D531944290A5AA0D05C25D32CF2DD675B339`,
  842,537 bytes — Eli's audit confirms this exact file).
- No `packages/`, `scripts/`, `migrations/`, or any source file touched. HEAD `52e3277` unchanged.

**Unfinished / left mid-work:**
- **The revised `0029` spec itself is NOT yet written.** The 14-item correction is logged, but folding
  it into a coherent successor spec (or a full rewrite pass) is the next real work item — deliberately
  not started, per the owner's "revise first, stop for review" ruling and the session ending here.
- Two open design questions are sitting with Eli (see above) — not yet logged as their own diary entry
  because they haven't been answered yet. **Whoever picks this up next should log Eli's answers (when
  they arrive) either as a further 0029 correction or fold them straight into the revised spec, per
  which arrives first.**

**Next recommended action:**
1. **Wait for Eli's answer** to the two open questions (adapter-registry approach; missing-mask fallback
   policy) before finalizing the revised spec — the owner is relaying these outside this session.
2. Once answered (or if the owner says proceed without waiting): write the **revised removal-lane spec**
   folding in all 14 items from the `0029` correction. This is a new spec artifact — either a new numbered
   entry or a clearly-marked full-rewrite section of `0029`; do not just patch the original filed body
   (never edit filed sections in place).
3. Log the revised spec, then **stop again for review** — do not proceed to the zero-spend probe or any
   build step without a fresh explicit go.
4. Only after that: the zero-spend probe (needs the owner's explicit key/network approval first), then
   the mask encoder, mock adapter, routing, caching/lineage, golden tests — per `0029`'s (soon to be
   revised) build order.
5. Unrelated, still-open standing items (unblocked by any of the above, but also not touched): the 4
   frozen §1 fixtures; a concrete `S3_REGION` for live fal `image.inpaint` validation.

**Blockers, warnings, dependencies, open decisions:**
- **Explicitly NOT authorized this session or the next, until stated otherwise:** running the fal
  zero-spend probe, reading the fal API key file, any provider call, any spend, any removal-lane code.
- Owner addressed me as "Marcus" and named "Ashley" as the key/network approver in one message — I
  signed per the registry as `CC-OPUS-01` (my confirmed identifier) and treated "Ashley" as the
  owner/approver whose explicit go is required before the probe. **Not resolved or clarified by the
  owner — flag for the next session** if this naming recurs (possible the owner is using
  role-names/nicknames across a multi-AI review workflow, not a registry change).
- Never bare FFmpeg 8.1.2; only vendored 7.1.1 via §6 wrapper. Node v22.23.1. Python `py -3.11`. Never
  recursively scan `library/tools/`. Never echo live keys. `.env` KEK; losing it makes encrypted
  provider rows unreadable.

**For deeper context, read these entries only:**
- `VHE-ISSUE-LOG-0029` — the removal-lane spec AND its correction (14 required revisions) — read the
  correction section first, it governs.
- `VHE-ISSUE-LOG-0030` — the backup/review-zip flatten defect + its correction (package audit
  reconciliation, new packaging conventions).
- `VHE-ISSUE-LOG-0028` §7a — the owner ruling `0029` was written to satisfy; still the governing ruling
  on lane choice / capability mapping / determinism / probe authorization.
