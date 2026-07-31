# VHE Handoff — 2026-07-21-11

| Field | Value |
|---|---|
| **Logged by** | `CC-SONNET-01` (Claude Opus 4.8 account model, continuing the CC-SONNET-01 §9.1 line) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-21 morning–midday (EDT) |
| **Project phase** | §9.1 hardened (`0021`) + first REAL paid provider inpaint validated (`0022`). |

**Keep this file short. Detail is in the numbered diary entries — referenced by number only.**

---

## What happened this session

1. **Owner relayed Eli's §9.1 conditional-pass review.** I verified all 5 code findings + the logging
   drift against source AND the §9.1 blueprint text before agreeing (2 were literal blueprint misses).
   Built the **§9.1 hardening patch** — see **`VHE-ISSUE-LOG-0021`**. Committed `66a8783`. 55/55.
2. **Owner authorized real-provider validation** (Eli step 2). **No fal.ai key exists in the library**
   (registry marks fal/replicate reference-only); owner chose **OpenAI** (+ Gemini "both"). Built real
   OpenAI + Gemini `image.inpaint` adapters, wired the keys **encrypted** into `provider_connections`,
   ran the **paid** validation. **OpenAI gpt-image-1 PASSED end-to-end**; **Gemini free key was
   rate-limited (429, no charge)**. See **`VHE-ISSUE-LOG-0022`**.

**Blueprint sections followed:** VHE-2 §7 (real adapters), §9.1 (hardening + validation), §2
(provider_connections wiring). No blueprint code was modified.

## Current working state (factual)

Repo `master`, local only, no remote. Newest commit = the `0022` real-provider validation (on top of
`66a8783` §9.1 hardening). **`pnpm test` → 67/67.** Preflight **PASS 13 / FAIL 4 / SKIP 1** (the temp
fixtures live in a subdir and do NOT green the gate — verified). `.env` gained a gitignored
`PROVIDER_KEK_V1`; provider keys are encrypted in Postgres under it. Paid before/after renders are in
`fixtures/_TEMP-provider-validation/out/` (gitignored; included in the review zip).

## Verified results (actual)

- **OpenAI gpt-image-1, live/paid:** both fixtures ok, 2 candidates each, **outside-mask delta 0 /
  inside-mask edited** (mask-scoped + non-destructive, re-checked independently), ~**13¢/fixture
  estimated** (no per-call price from the API; dashboard authoritative). Box dims confirm the `0021`
  feather-aware crop is active.
- **Plumbing validated, NOT repair quality** — synthetic fixtures; the model reinterpreted the region
  creatively. Quality validation stays OPEN until the owner's frozen §1 fixtures run.
- **Gemini:** 429 rate-limit on the free key; adapter + error mapping correct.
- **Suite 67/67**; adapters unit-tested vs a mock `fetch` before any spend.

## Open for the owner (unchanged unless noted)

- **Frozen §1 fixtures** (`bad_hand.png`, `garbled_text.png`, 2 mp4s) — still the FAIL 4, and the only
  way to test repair QUALITY. (`0009`/`0011`.)
- **fal.ai/Replicate** — no key in the library; key + model picks needed if wanted.
- **Gemini paid key** — free key is quota-limited; a paid ("AQ."-format) key could validate Gemini.
- **`0022` architecture findings** — adapter storage seam / output-persistence / cost-from-usage:
  flagged, not silently changed. Owner call.
- **`VHE-ISSUE-LOG-0007`** — worker topology, still deferred.

## Next recommended action

1. Read `CURRENT-STATUS.md`, then `VHE-ISSUE-LOG-0022` + `0021`.
2. Either **build §9.2's deterministic core** (authorized path, no key/GPU needed — §6.3 frame
   extraction + keyframe math + per-frame composite reusing §9.1's `compositeUnderMask`), or run
   repair-QUALITY validation once the real §1 fixtures arrive.

## Blockers / warnings

- 🚨 System FFmpeg 8.1.2 on PATH — never bare `ffmpeg`. Python `py -3.11`. Never recursively scan
  `library/`. fnm not reliably on PATH — use the pinned node directly.
- **Never echo a live API key**; wiring prints only a sha256[:8] fingerprint. Losing `PROVIDER_KEK_V1`
  makes the encrypted `provider_connections` rows undecryptable.
- Two zips were generated this session-close (full backup + review package) — regenerable, gitignored.

**For deeper context, read these entries only:** `VHE-ISSUE-LOG-0021` (§9.1 hardening),
`VHE-ISSUE-LOG-0022` (real-provider validation).
