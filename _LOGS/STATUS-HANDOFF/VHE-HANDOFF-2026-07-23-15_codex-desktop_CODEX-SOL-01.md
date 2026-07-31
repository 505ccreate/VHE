# VHE Handoff — 2026-07-23-15 — Marcus restart brief

| Field | Value |
|---|---|
| **Logged by** | `CODEX-SOL-01` — Codex Sol |
| **Platform / room** | Codex — Desktop app, Windows 11 |
| **Session window** | 2026-07-23 06:10 EDT |
| **Purpose** | Cross-platform transfer to Marcus after his weekly session reset |

## Marcus: start here

1. Read `CURRENT-STATUS.md`, then `VHE-ISSUE-LOG-0025`; read `0024` only for §9.2/provider detail.
2. Baseline commit is `25a3ef7` (`master`, local only). Full suite was **123/123 PASS**; preflight **13 PASS / 4 FAIL / 1 SKIP**.
3. Restore point: `C:\Users\user\Documents\VHE Backups\Video-Hallucination-Editor_backup_2026-07-22_2222.zip`, SHA-256 `03E7110C180BFC4F084B5B858C3DCE5AA0FE4A45235CC95E859F8F2B271E919B`.

## What is built

- §9.2A deterministic video-repair plumbing.
- §9.5 deterministic chunking: W=48/O=8, global keys/seed, child idempotency + `parent_job_id`, resume, carry-mask handoff, mask-only overlap blend, masked SSIM, memory ceiling.
- Correction: 300 frames require **8** windows; blueprint's repeated 7-window sentence drops 12 frames (`0025`).

## Two separate blockers — do not conflate them

1. **Missing evidence:** four frozen §1 fixtures are absent: `bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`, `bad_hand_6s.mp4`.
2. **Missing repair execution:** this PC has no CUDA GPU. “Hosted GPU” means a paid remote API/provider runs SAM 2, ProPainter, RIFE, or `video.inpaint` on its GPUs and returns results. No such §9.2 video-repair adapter/key/model choice is connected or certified yet. fal.ai and Replicate are staged SDK references only; keys/accounts/model picks are absent. OpenRouter-first is for the later video-generation layer, not proof of repair execution.

## Honest next move

Acquire the four fixtures, then choose and wire one hosted §9.2 repair path (or an external CUDA worker) before running the full real-video exit gate: output count, restart identity, overlap SSIM ≥ 0.98, and peak RSS. Do not call deterministic mock coverage “repair quality.”

## Warnings

Vendored FFmpeg 7.1.1 wrapper only; never bare FFmpeg 8.1.2. Node v22.23.1 local runtime is under `C:\Users\user\Documents\VHE Runtimes\node-v22.23.1`. Python is `py -3.11`. Never expose keys or recursively scan `library/tools/`. The Higgsfield source `.docx` remains untracked.

**Tests run this transfer session:** none; documentation/handoff only.
