# VHE Handoff — 2026-07-21-13

| Field | Value |
|---|---|
| **Logged by** | `CC-HAIKU-01` (Claude Haiku 4.5 — same account as the other CC-* rows; self-registered this session) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-21 evening (EDT) |
| **Why this handoff** | Eli's Q1–Q4 rulings came in; built §9.2A + three provider-layer refactors. Session-end close. |

**Supersedes handoff `-12` as latest.** Detail lives in `VHE-ISSUE-LOG-0024` (+ appended corrections
on `0022` and `0023`); referenced by number.

---

## What happened this session
The owner relayed Eli's rulings on the 4 open questions and authorized the build. All four are now
**recorded and acted on** (`OPEN-QUESTIONS-FOR-ELI_2026-07-21.md` marked ANSWERED):

- **Q1 → §9.2A deterministic video-repair core BUILT.** `packages/repair/video-repair.ts`: padded
  range extraction ([a−4..b+4] over §6.3), keyframe set {a,a+s,…,b} (stride 4–6, force b) + RIFE
  interp `t=(f−k1)/(k2−k1)`, §8 absolute↔local translation, §9.2 mask-only per-frame composite
  (reuses §9.1 `compositeUnderMask`, non-destructive), one-patch-per-keyframe output validation,
  preview-window assembly ([a−4..b+4] only, via §6 wrapper). GPU/hosted pieces (SAM/ProPainter/RIFE/
  provider video.inpaint) stay OUT. **Repair QUALITY still UNPROVEN** — owner's real-§1-fixture gate.
- **Q2a → versioned `ProviderExecutionContext`** replaced the `0022` factory-closure.
  `packages/providers/execution-context.ts`; adapters read via ctx + return native bytes/URLs;
  registry owns download→validate→content-addressed-store→assetKeys. `storage-seam.ts` deleted; both
  real adapters migrated. Recorded as an append on `0022`.
- **Q2c → versioned pricing catalog.** `packages/providers/cost-catalog.ts`: per-(provider,model)
  rates + provenance; `CostRecord{rawUsage, estimatedCents, reportedCents, provenance,
  authoritative}`; dashboard authoritative when no exact cost. Adapters' hardcoded rates removed →
  delegate to catalog. `RunGenerationResult.cost` added.
- **Q3 → hybrid manifest cache seam.** `packages/providers/manifest-cache.ts`: live/snapshot/
  last-known-good, 24h TTL, refreshOnConnect, manual snapshots. SEAM only — NOT wired into the
  hardcoded-manifest adapters (owner: don't retrofit). Append on `0023`.
- **Q4 → gen layer stays deferred.** OpenRouter-first video, direct adapters later, hosted
  consent-gated identity before self-hosted face-swap. Append on `0023`. No gen-layer code.

## Current working state (factual)
- **Suite: `vitest run` → 109/109 GREEN, 13 files** (+48 this session).
- **⚠️ Baseline correction:** prior handoff/CURRENT-STATUS said "67/67"; the real committed baseline
  was **61/61** (no `*.test.ts` diff vs HEAD — a prior miscount, not a regression). Fixed in the record.
- **Preflight: PASS 13 / FAIL 4 / SKIP 1, UNCHANGED** (the 4 FAILs = undelivered §1 AI fixtures).
- **No TypeScript typecheck gate exists** (no tsconfig/tsc/`typescript` dep); Node-22 type-stripping
  runs `.ts` directly. The suite IS the gate — matches how 0012–0022 verified.
- **Git: `master`, local only. NOT committed this session** (owner didn't request it). `git status`:
  M `_LOGS/*` (index/registry/logs); many new/modified `packages/providers/*` + `packages/repair/*`
  + `scripts/validate-provider-inpaint.ts`; deleted `adapters/storage-seam.ts`; untracked
  `VHE-ADDON-SOURCE-1_*.docx` (still owner's call). **The build is green but uncommitted — commit is
  the next builder's / owner's call.**

## Next recommended action (new room)
1. Read `CURRENT-STATUS.md`, then `VHE-ISSUE-LOG-0024` (+ the appends on `0022`/`0023`).
2. **Decide on committing** this green build (owner didn't ask this session).
3. The GPU/hosted §9.2 remainder (SAM tracking, ProPainter, RIFE, provider video.inpaint) and the
   **repair-QUALITY validation** both still need the owner's real §1 fixtures and/or a GPU/hosted
   path — unchanged hard gates. §9.5 chunked windows is the next deterministic-buildable section if
   authorized (reuses §9.2A's keyframe set + composite).

## Blockers / warnings
- 🚨 System FFmpeg 8.1.2 on PATH — never bare `ffmpeg`; only the vendored 7.1.1 via the §6 wrapper.
  Python `py -3.11`. Never recursively scan `library/`. fnm not reliably on PATH — use the pinned node
  (`%APPDATA%\fnm\node-versions\v22.23.1\installation\node.exe`).
- **Never echo a live API key.** Losing `PROVIDER_KEK_V1` makes the encrypted `provider_connections`
  rows undecryptable.

**For deeper context, read only:** `VHE-ISSUE-LOG-0024`, and the appended corrections on `0022`/`0023`.
