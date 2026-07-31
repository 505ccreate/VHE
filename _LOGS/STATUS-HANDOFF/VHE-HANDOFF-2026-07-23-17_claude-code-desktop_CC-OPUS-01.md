# VHE Handoff — 2026-07-23-17 — fal.ai image.inpaint adapter built

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 |
| **Session window** | 2026-07-23 06:31–06:50 EDT |
| **Purpose** | Wire the fal.ai provider adapter (owner-authorized; key now in the central library) |

## What was done — see `VHE-ISSUE-LOG-0026`

- Built the real fal.ai `image.inpaint` adapter (`packages/providers/adapters/fal-image.ts`) — the
  first async (queue) and first URL-in/URL-out provider adapter. Transport verified against fal's
  own queue docs. Registered fal in the two harness scripts (validate-inpaint + wire-connection).
- **Full suite 133/133 PASS (15 files)**, up from 123/123; +10 tests in one new file, no regressions.
- **Preflight PASS 13 / FAIL 4 / SKIP 1 — unchanged** (still only the four undelivered §1 fixtures).

## Owner instructions honored

- Proceeded with the fal adapter (key confirmed present; contents never read/echoed).
- Did NOT synthesize §1 fixtures. Real-quality gate stays OPEN.

## OPEN DECISIONS flagged for the owner (not chosen for you)

1. **fal model id + per-model schema.** Default `fal-ai/flux-general/inpainting` with standard flux
   fields (`image_url`/`mask_url`/`prompt`/`num_images`/`seed`), `opts.model`-configurable. Confirm
   the model before any live spend.
2. **fal pricing.** No catalog entry invented — fal falls back to the §7 chain-head estimate. Add a
   real entry once the model + a dashboard figure are confirmed.

## Prerequisites before a LIVE fal call (none done this session, by design)

- The four frozen §1 fixtures (still owed — `VHE-ISSUE-LOG-0009`/`0011`).
- An **S3-backed AssetStore** for the validate harness: fal fetches inputs by URL, so `signUrl`
  must return a presigned PUBLIC url. The current harness store returns a local path fal can't reach.
- Owner confirmation of the model id (#1 above).
- Wire the fal `provider_connections` row: `WIRE_PROVIDER=fal WIRE_KEYFILE=<path> WIRE_KEYNAME=<line>`
  (the fal key file line name, e.g. `FAL_KEY`). Row-wiring does not authorize a live call.

## Honest boundary (unchanged from Codex Sol's handoff, extended)

This adds a fal adapter validated by MOCKS ONLY. It proves fal transport + the URL-in/URL-out seam,
NOT repair quality and NOT that the chosen fal model produces good inpaints. The §9.2/§9.5 real-video
exit gate and the §9.1 real-fixture quality gate remain OPEN.

## Next actions

1. Deliver the four frozen §1 fixtures.
2. Owner: confirm the fal model id (and add its pricing when known).
3. Add an S3-backed store to the validate harness, then run the live fal `image.inpaint` validation.
4. Keep video generation / identity-face-swap / deployment topology deferred.

## Warnings (unchanged)

- Never use bare system FFmpeg 8.1.2; only vendored 7.1.1 via the §6 wrapper.
- Node v22.23.1 (`%APPDATA%\fnm\node-versions\v22.23.1`); Python `py -3.11`.
- Never recursively scan `library/tools/`. Never echo live keys. `.env` holds the provider KEK.
- `VHE-ADDON-SOURCE-1_Higgsfield_Clone_Teardown_7-21-2026.docx` still untracked pending owner decision.
