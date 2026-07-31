# VHE Handoff — 2026-07-23-23 — video-removal-lane provider comparison (decision memo, no code)

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 |
| **Session window** | 2026-07-23 afternoon EDT |
| **Purpose** | Owner-directed fixture-independent work: written comparison of the two hosted video-removal options, stop-for-approval. **No code changed.** |
| **HEAD** | `52e3277` (unchanged) |

## Owner directives this session (recorded verbatim in intent)
1. ELI-REVIEW / progress zips stay descriptive one-offs — NOT folded into the v01–v04 restorable-backup series.
2. Do not move/rename/delete/version any backup outside the 4 in `VHE Backups\` without showing the owner first.
3. NO live fal call, NO spend. Owner will supply the 4 frozen §1 fixtures + a concrete `S3_REGION`.
4. Prepare a written `video.inpaint` vs hosted-ProPainter-equivalent comparison; **stop for approval before implementing.** No lock-in, no irreversible architecture.

## What I did
- Wrote **`VHE-ISSUE-LOG-0028`** — the removal-lane decision memo. Grounded in (a) the built seam
  (`providers/types.ts` — `video.inpaint` already in the Capability union; `providers/routing.ts` —
  `routeChain`/`manifestSatisfies` already filter duration/dims/mask; `adapters/fal-image.ts` — the
  async fal-queue transport a video adapter reuses; `repair/video-repair.ts` — the §9.2A core the
  removal lane sits beside) and (b) live provider research (real endpoints + pricing, 2026-07-23).
- Claimed + indexed 0028 in `LOG-INDEX.md` (next number now 0029).

## The comparison in one paragraph
Because this is API-only / no local GPU, the blueprint's default "ProPainter over the range" must be
*hosted*. Three real candidates: **A** = `fal-ai/wan-vace-14b/inpainting` (diffusion `video.inpaint`;
mask-video or salient-mask, 81–241 frames, 5–30 fps, ≤720p, **has seed**, fal queue,
$0.04–0.08/video-sec by res); **B1** = `fal-ai/void-video-inpainting` (ProPainter-class object removal;
quad-mask-video, fal queue, **flat $0.05/video** / $0.10 Pass2, **no stated seed**, limits
unpublished); **B2** = Replicate `jd7h/propainter` (literal ProPainter, flow-deterministic, GPU-sec
billing, **but 2023-stale + needs a brand-new Replicate adapter**). Router-fit: A registers under the
existing `video.inpaint` cap with **zero routing change**; B needs either the same reuse or a new
`video.removal` enum (blueprint-code edit — avoid). All three need a small new **per-frame-masks →
mask.mp4** encoder (via the §6 `encodeMidArgs` recipe). **I did NOT choose** — five ruling questions
are listed in 0028 §5.

## Verified state (unchanged — no code touched)
- Suite **153/153**, preflight **13/4/1** as of 0027; not re-run (memo only).
- HEAD `52e3277`. Working tree: same untracked/modified set as session start + the new 0028 log,
  updated LOG-INDEX/CURRENT-STATUS, this handoff. No `packages/`, `scripts/`, or blueprint change.

## Next action
1. **Owner:** rule on the five questions in `VHE-ISSUE-LOG-0028` §5 (which lane first · `video.inpaint`
   vs new `video.removal` cap · determinism waiver for a seedless removal model · whether I may do a
   zero-spend limits probe · confirm the mask-video encoder prerequisite). **A ruling unblocks the build.**
2. Still owed (unchanged): the **4 frozen §1 fixtures** + a concrete **`S3_REGION`** for the first live
   fal `image.inpaint` validation.
3. Deferred as before: RIFE interpolation, deployment topology (0007), OpenRouter/gen-layer.

## Sources (0028 research, 2026-07-23)
- fal Wan VACE 14B inpainting API — https://fal.ai/models/fal-ai/wan-vace-14b/inpainting/api
- fal VOID video inpainting — https://fal.ai/models/fal-ai/void-video-inpainting
- fal pricing (Wan VACE per-video-second by resolution) — search result, fal.ai
- Replicate ProPainter listing — https://www.aimodels.fyi/models/replicate/propainter-jd7h ; Replicate hardware-per-second billing
