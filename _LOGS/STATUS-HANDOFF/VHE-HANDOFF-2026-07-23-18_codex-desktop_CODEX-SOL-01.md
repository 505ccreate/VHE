# VHE Handoff — 2026-07-23-18 — fal image adapter audited and checkpointed

| Field | Value |
|---|---|
| **Logged by** | `CODEX-SOL-01` — Codex Sol |
| **Platform / room** | Codex Desktop, Windows 11 |
| **Session window** | 2026-07-23 06:50–06:53 EDT |
| **Purpose** | Audit and act on `CC-OPUS-01`'s uncommitted fal adapter report |

## Outcome

- Kept Marcus/`CC-OPUS-01`'s real fal async URL-in/URL-out `image.inpaint` adapter.
- Verified `fal-ai/flux-general/inpainting` directly against fal's official model API page. The
  endpoint and primary queue input/output schema are real; model confirmation is no longer an
  owner decision.
- Corrected two provider-contract defects before checkpoint:
  1. advertised and submitted the endpoint's supported `negative_prompt`;
  2. sent explicit `image_size: {width,height}` so provider output does not silently use a size
     different from the crop expected by the compositor.
- Tightened the scope record: this is a §9.1 still-image lane and a future dependency for §9.2
  content-replacement keyframes. It is not `video.inpaint`, not the default removal lane, and not a
  complete hosted §9.2/§9.5 execution path.

## Verification

- Pinned Node: `C:\Users\user\Documents\VHE Runtimes\node-v22.23.1\PFiles64\nodejs\node.exe`
- Target adapter suite: **10/10 PASS**
- Full Vitest suite: **133/133 PASS, 15 files**
- Preflight: **PASS 13 / FAIL 4 / SKIP 1**
  - Only failures: `bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`, `bad_hand_6s.mp4`
  - Vendored FFmpeg/ffprobe 7.1.1 verified; S3/Postgres/Redis reachable
- No key contents read or printed. No live provider call. No money spent. No synthetic fixtures.

## Honest boundary and next work

1. The four owner-provided frozen fixtures still block real quality gates.
2. The validate harness needs its reachable S3 store wired into `AssetStore.signUrl` before fal can
   fetch signed inputs.
3. After the still-image live gate, implement the §9.2 hosted execution layer: image-inpaint
   keyframes for content replacement, plus a separately selected removal provider. fal's published
   video inpainting contracts are materially different and were not silently folded into this
   image adapter.

## Workspace warning

- `VHE-ADDON-SOURCE-1_Higgsfield_Clone_Teardown_7-21-2026.docx` remains an unrelated untracked
  owner file and was not included.
