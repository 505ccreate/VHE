# Correction Studio (VHE) — builder entry point

**Before doing anything else in this project, read `_LOGS/README.md`.**

This project is built across multiple AI platforms, accounts, sessions, and rooms. The `_LOGS/`
system exists so no builder ever has to assume, guess, drift, or re-derive context.

## Fast start

1. `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — where the project actually stands right now
2. The newest file in `_LOGS/STATUS-HANDOFF/` — the last session's handoff
3. `_LOGS/SESSION-PROTOCOL.md` — how you are expected to log **during** this session, not just at
   the end
4. Only the `_LOGS/ISSUE-RESOLUTION-LOG/` entries the handoff names. Use `_LOGS/LOG-INDEX.md` to find
   a specific one. **Do not read the whole library.**

## AI review / consultation assignments

If Ashley sent you here to **review, audit, consult, inspect, or grade another AI's work**, do not begin
implementation and do not improvise an assignment from CURRENT-STATUS. Open:

1. `_LOGS/AI-REVIEW-JOBS/README.md` — permanent reviewer rules and verdict protocol
2. The file beginning with `_LOGS/AI-REVIEW-JOBS/ACTIVE-` — the current exact assignment

The active assignment controls the review scope, required source seams, prohibitions, signature, and output
format. The author of the material under review cannot self-certify the assignment as independent.

## Source of truth

`VHE-1` (vision) · `VHE-2` (execution plan, §0–§17) · `VHE-3` (pre-flight checklist) ·
`VHE-4` (voice & audio, §A0–§A12) · `VHE-5` (lip sync & dialogue, v1.1 incl. Track C, §B0–§B11).

The `.docx` files in the project root are authoritative. For reading and searching, use the
plain-text mirror in `_BLUEPRINTS-TEXT/` — but **verbatim code blocks must be copied from the
original .docx** (the mirror is lossy). If you change any blueprint, rerun
`python _BLUEPRINTS-TEXT/_regenerate.py` in the same session.

- **VHE-1 through VHE-4 are intact and are not to be modified.**
- **VHE-5 is active and still subject to revision. It is not frozen.**

## Tools library — check before downloading anything

`library/` holds 52 checksum-verified tool bundles (API-only profile, staged from the central
Soren Tools Library): runtimes, FFmpeg 7.1.1 + ffprobe, every VHE-3 Node/Python/frontend
dependency, fonts, QA tools, and the fal.ai / Replicate / OpenAI / Google Gen AI / ElevenLabs
SDKs. Before downloading any dependency, check `library/manifest.json` and `library/receipts/`.

- Artifacts are **staged, not installed** — nothing there is on PATH or importable until
  pre-flight wires it in deliberately.
- **Never recursively scan `library/tools/`** (37k files — it will hang your tools). Read the
  manifest and receipts instead.
- Test fixtures and MinIO are deliberately absent. API credentials never go in there — the owner
  keeps a separate central API-key library and grants access per room.
- Details: `VHE-ISSUE-LOG-0006`. Windows-incompatible bundles + alternatives: `VHE-ISSUE-LOG-0005`.

## Settled decisions (do not re-litigate)

- **Stack confirmed** (VHE-2 §17 Q1): Node 22 + Fastify · Postgres 16 · Redis 7 + BullMQ ·
  S3-compatible storage · Next.js/React, exactly as VHE-2 prescribes.
- **API-only launch** (Q3): no local model weights, no CUDA torch. fal.ai + Replicate adapters
  first. (This dev machine has no CUDA GPU — local inference is impossible here anyway.)
- **Build locally, host free-tier** (Vercel / Firebase / Supabase). Production worker topology is
  still open — see `VHE-ISSUE-LOG-0007` before writing any deployment config.
- **Warning:** system PATH has FFmpeg **8.1.2** — VHE-2 forbids using it. Only the vendored 7.1.1
  (from `library/`, via the §6 wrapper) may ever run. Python workers use `py -3.11`, never bare
  `python` (which is 3.13/3.15 on this machine).

## Non-negotiables

- No assumptions, no pivots, no silent scope growth. If the blueprint does not specify it, log it as
  an open decision — do not choose for yourself.
- Never claim something is resolved or tested without verification. State what you ran and what it
  output.
- Every FFmpeg invocation goes through the VHE-2 §6 wrapper. If the command you need is not there,
  stop and flag it.
- Code blocks in VHE-2 are copied verbatim; only `// BUILDER:` lines are adapted.
- Coordinates normalized 0.0–1.0 · times in integer milliseconds · frame indices derived from ms +
  rational fps. **Floating-point fps (29.97) never appears in code** — only `fps_num`/`fps_den`.
- Log as you work. Assume your session can be cut off mid-task at any moment.
- Sign every log entry with your identifier from `_LOGS/AI-ACCOUNT-REGISTRY.md`. If you are not
  listed there, ask the owner for one — do not invent it.
