# VHE Handoff — 2026-07-23-19 — S3 presign store + §9.2 keyframe orchestration

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 |
| **Session window** | 2026-07-23 07:05–07:30 EDT |
| **Purpose** | (1) S3-backed AssetStore w/ presigned inputs; (2) no-spend §9.2 keyframe orchestration |
| **Baseline commit** | `96fc986` (Codex Sol's fal adapter) — this session's work is UNCOMMITTED on top |

## What ran and what passed — see `VHE-ISSUE-LOG-0027`

- **Targeted:** `s3-store.test.ts` **13/13 PASS**; `keyframe-repair.test.ts` **4/4 PASS**.
- **Full Vitest:** **150/150 PASS, 17 files** (from 133/133 / 15; +17 tests, +2 files, no regressions).
- **Preflight:** **PASS 13 / FAIL 4 / SKIP 1 — unchanged** (only the four undelivered §1 fixtures;
  S3/Postgres/Redis reachable; vendored FFmpeg/ffprobe 7.1.1 verified).
- Node: `%APPDATA%\fnm\node-versions\v22.23.1\installation\node.exe` (v22.23.1).

## Deliverables

1. `packages/storage/s3-store.ts` (+test) — AWS SigV4 query presigning in `node:crypto` only (no new
   dependency; the library ships client-s3 but not the presigner). `signUrl` → short-lived, publicly
   reachable presigned GET URL so fal can fetch inputs; PUT via the vetted client-s3. SigV4 core
   anchored to AWS's published `get-vanilla` known-answer vector (non-circular). Secret key never
   appears in a URL/log/error. Wired into `scripts/validate-provider-inpaint.ts` (fal→S3 default,
   openai/google local, `VAL_STORE=local|s3` override).
2. `packages/repair/keyframe-repair.ts` (+test) — §9.2 content-replacement orchestration:
   `runKeyframeContentReplacement` routes each global keyframe (`keyframeSet`, computed once) through
   the hardened §9.1 `runImageInpaint` with the ONE fixed seed; candidate[0] deterministic.

## What remains UNVERIFIED (honest boundary)

- No live fal call, no live S3 GET, no synthetic fixtures — **repair quality gate stays OPEN.**
- Presign acceptance by the live endpoint is unverified: it needs a **concrete `S3_REGION`** (`.env`
  default `auto` cannot be signed) plus valid creds. Not exercised this session by design.
- The orchestration does NOT interpolate non-key frames (RIFE, GPU-blocked) and does NOT do removal
  (`video.inpaint`/ProPainter) — the removal lane is still unselected and unbuilt (owner boundary).

## Scope boundary held

The fal image adapter + this S3 store + this keyframe orchestration together serve §9.1 and the §9.2
CONTENT-REPLACEMENT keyframe stage only. They are NOT `video.inpaint`, NOT the ProPainter-equivalent
removal path, and do NOT complete the §9.5 real-video quality gate.

## Next actions

1. Deliver the four frozen §1 fixtures.
2. Set a concrete `S3_REGION`, then run the live fal `image.inpaint` validation
   (`VAL_PROVIDER=fal` now uses the S3 store automatically) — first real fal spend.
3. Select + implement the video-removal lane (`video.inpaint` or hosted ProPainter equivalent);
   separately, drive RIFE interpolation of non-key frames (both GPU/hosted, still deferred).
4. Run the real §9.2/§9.5 quality and restart/RSS gates once fixtures + hosted lanes exist.

## Files intentionally untouched

`packages/repair/video-repair.ts`, `packages/providers/adapters/fal-image.ts`, and the untracked
`VHE-ADDON-SOURCE-1_Higgsfield_Clone_Teardown_7-21-2026.docx` (owner file) were not modified.

## Warnings (unchanged)

- Never use bare system FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper. Node v22.23.1; Python `py -3.11`.
- Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.
