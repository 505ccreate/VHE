# VHE Handoff — 2026-07-21-12 (room close)

| Field | Value |
|---|---|
| **Logged by** | `CC-SONNET-01` (Claude Opus 4.8 account model, CC-SONNET-01 line) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-21 morning–afternoon (EDT) |
| **Why this handoff** | Owner is moving to a **brand-new room**. Clean close; the Eli questions are persisted for the new room to pick up when Eli responds. |

**Supersedes handoff `-11` as latest.** Detail lives in the numbered diary entries; referenced by number.

---

## ⭐ NEW ROOM — read in this order
1. `CURRENT-STATUS.md`
2. **`OPEN-QUESTIONS-FOR-ELI_2026-07-21.md`** ← the owner is awaiting Eli's answers on these; bring them
   in when he responds and record each ruling in the cited log. Do not act beyond what's authorized.
3. `VHE-ISSUE-LOG-0021` (§9.1 hardening), `0022` (first real paid provider run), `0023` (Higgsfield
   source assessment). That's enough context; don't read the whole library.

## What happened this session (three diary entries)
- **`0021` — §9.1 hardening** (Eli's conditional-pass findings, all verified vs source + blueprint):
  feather-aware crop, provider scale-to-fit (replaces "route around"), zero-candidate rejection, input
  validation, bounded prompt-conflict subtraction, ICC/EXIF preserved. Commit `66a8783`.
- **`0022` — first REAL paid provider validation.** No fal.ai key exists in the library → owner chose
  OpenAI (+ Gemini). Built real `image.inpaint` adapters (`packages/providers/adapters/*`), wired the
  key **encrypted** into `provider_connections` (new `PROVIDER_KEK_V1` in gitignored `.env`).
  **OpenAI gpt-image-1 PASSED live** end-to-end (mask-scoped, non-destructive, ~13¢/fixture est.);
  **Gemini free key rate-limited** (no charge). Validated PLUMBING, not repair QUALITY. Commit `f31694d`.
- **`0023` — Higgsfield teardown source** assessed: NOT too late (targets the unbuilt generation layer;
  nothing built conflicts). No code changed. Commit `b0d13e0`.

## Current working state (factual)
- Repo `master`, local only, no remote. HEAD after the gitignore commit for the context zip.
- **`pnpm test` → 67/67.** Preflight **PASS 13 / FAIL 4 / SKIP 1** (temp fixtures in a subdir do NOT
  green the gate — verified).
- **Tree clean except ONE untracked file:** `VHE-ADDON-SOURCE-1_Higgsfield_Clone_Teardown_7-21-2026.docx`
  (owner-added; left untracked for the owner to decide — Q4).
- `.env` (gitignored) now holds `PROVIDER_KEK_V1`; provider keys are encrypted in Postgres under it.
- Three review zips generated this session (all gitignored, regenerable): `VHE-BACKUP-FULL_2026-07-21`,
  `VHE-SECTION-9-HARDENING-VALIDATION-ELI-REVIEW_2026-07-21`, `VHE-CONTEXT-FOR-ELI_2026-07-21` (the
  full-context upload for Eli). The context zip contains README + all logs + source + blueprint mirror
  + validation evidence + the addon `.docx`; it does NOT contain the questions list (that's this file).

## Next recommended action (new room)
1. Read the three files above.
2. When Eli's answers arrive, record each in the cited log and proceed ONLY on what's authorized.
3. Absent that, the authorized-buildable path is **§9.2's deterministic core** (frame extraction +
   keyframe math + per-frame composite reusing §9.1's `compositeUnderMask`) — pending Eli's Q1 ruling.

## Blockers / warnings
- 🚨 System FFmpeg 8.1.2 on PATH — never bare `ffmpeg`. Python `py -3.11`. Never recursively scan
  `library/`. fnm not reliably on PATH — use the pinned node directly (see `CURRENT-STATUS`).
- **Never echo a live API key.** Losing `PROVIDER_KEK_V1` makes the encrypted `provider_connections`
  rows undecryptable. A Bash command reading key-file contents was (correctly) classifier-blocked this
  session — wire keys inside a script with redacted output.

**For deeper context, read only:** `VHE-ISSUE-LOG-0021`, `0022`, `0023`, and
`OPEN-QUESTIONS-FOR-ELI_2026-07-21.md`.
