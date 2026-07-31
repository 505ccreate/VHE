# VHE Handoff — 2026-07-20-08

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` (Claude Opus 4.8) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-20 late morning (EDT) |
| **Project phase** | §2–§6 core + §4 transport done; **§7 core now built and its exit gate passes live.** §8/§9/§10 unblocked. |

**Keep this file short. Detail belongs in the numbered diary entries. Reference them by number.**

---

**Blueprint sections followed:** VHE-2 §7; §6.1 (boundary tests).

**Current working state (one paragraph, factual):**
The owner answered §17 Q2 this session (relayed via Eli/ChatGPT) — recorded as `VHE-ISSUE-LOG-0018`.
That unblocked §7, which was then built (`VHE-ISSUE-LOG-0019`): `packages/providers/*` — AES-256-GCM
BYOK key storage, capability routing (owner-default first, then fal→replicate→google→openai fallback,
skip-if-no-key/capability), `runGeneration`/`walkChain`, and cost estimation. Real fal/Replicate/
Google/OpenAI SDK adapters were **deferred by owner scope this session** (BYOK, no key in this room →
unverifiable). Repo on `master`, local only. **§7 committed; working tree CLEAN.** `pnpm test` →
**32/32** under fnm Node 22.23.1 against live Redis + live Postgres. `pnpm preflight` →
**PASS 13 / FAIL 4 / SKIP 1** (unchanged; the 4 FAILs are still only the undelivered owner fixtures).

**Commit hashes (for the §7 review / diff):**
- **Pre-§7 baseline** (commit immediately before §7 began): `41b9657169a4f6ed456a4a95bc87d9cf6582f276`
  (`41b9657`) — "Section 4 production BullMQ transport; two blueprint defects made retry silently dead".
- **§7 implementation commit** (all `packages/providers/*` + tests + the §6.1 boundary tests + the
  0018/0019 diary + LOG-INDEX + this handoff at H1-time): `f77aaf11604e30a5e1423e41a905e7a9da7a5e28`
  (`f77aaf1`) — "Section 7: BYOK provider adapters + capability routing (core + exit gate)".
- **`HEAD`** is a small logs-only follow-up on top of `f77aaf1` that records these hashes (this file +
  a 0019 correction). It carries no source change; run `git log --oneline -3` for its id.
- **Review diff range:** `41b9657..HEAD` — bundled in the review zip as `SECTION-7.patch` (format-patch)
  and `SECTION-7.diff`, plus `COMMITS.txt` listing all three hashes.

**Completed this session:**
- Recorded the owner ruling (`VHE-ISSUE-LOG-0018`): visual routing fal→replicate→google→openai
  (fallback only; owner default first; capability-filtered); ElevenLabs = audio-only (VHE-4); audio
  default google→openai→elevenlabs; 4 fixtures arrive as frozen files (don't block §7); keep
  PG17/waiver/§6.1 + add fps boundary tests.
- Built §7 core (`VHE-ISSUE-LOG-0019`) — 7 modules under `packages/providers/` + tests.
- Added the §6.1 arbitrary-integer-ms seek boundary tests (Ruling 3).

**Tested — with actual results:**
- `node node_modules/vitest/vitest.mjs run --reporter=verbose` → **6 files / 32 tests PASS** (was 21).
  §7 live-Postgres exit gate ran 1922 ms (real DB writes, not self-skipped).
- `pnpm preflight` → **PASS 13 / FAIL 4 / SKIP 1** (unchanged).

**Files created or changed:**
- `packages/providers/{types,crypto,cost-defaults,routing,connections,cost,registry}.ts` — created.
- `packages/providers/providers.test.ts` — created.
- `packages/media/ffmpeg.test.ts` — added §6.1 boundary block.
- `_LOGS/*` — 0018 + 0019 diary entries, LOG-INDEX updated, this handoff, CURRENT-STATUS overwritten.

**Unfinished / left mid-work:**
- Nothing mid-refactor. §7's real provider adapters are a clean DEFERRAL (see next action), not
  half-done work. The registry/routing are provider-agnostic and ready to receive them.

**Next recommended action:**
1. Read `CURRENT-STATUS.md`, then this handoff. For depth read **only** `VHE-ISSUE-LOG-0019` (build)
   and `0018` (the ruling).
2. **Decide the deferred item with the owner:** grant a provider key to this room (or supply one BYOK)
   so the real fal/Replicate/Google/OpenAI adapters can be built AND verified. Build them in the
   `0018` order; each implements `ProviderAdapter` and registers via `registerAdapter`.
3. With `runGeneration` in place, **§9 image inpaint (§9.1)** is the natural next build — it calls
   `runGeneration` with an `image.inpaint` request. §8 (SAM mask propagation) is a Python worker and
   is LOCAL_GPU-gated (API-only here → hosted-equivalent or RAFT fallback path).
4. Wire `estimateCostCents` from `packages/providers/cost.ts` into `createJob`'s `deps.estimateCostCents`
   at the API composition root when it's built (drop-in; no §4 change).

**Blockers, warnings, dependencies, open decisions:**
- ✅ **Committed.** `packages/providers/*` + tests + `_LOGS/*` committed to `master`; tree clean. A §7
  review zip for Eli was generated post-commit (`VHE-SECTION-7-ELI-REVIEW_2026-07-20.zip`, gitignored).
- 🟡 **Config table vs. code for §7 cost defaults** (`0018` §4 / `0019` §4): implemented as a data
  module (`cost-defaults.ts`); §7 text says "config table." If the owner wants a DB table, it's a
  future migration. Blocks nothing.
- 🟡 **`VHE-ISSUE-LOG-0017` two §4 rulings still await owner review** (unchanged — blocks nothing).
- **4 AI fixtures** still tracked debt (`0018` Ruling 2 confirms supply-as-frozen-files; append sha256
  on delivery → preflight green).
- `VHE-ISSUE-LOG-0007` production worker topology still open.
- 🚨 System FFmpeg 8.1.2 on PATH — never bare `ffmpeg`. `npx` NOT on tool-shell PATH; run vitest as
  `fnm.exe exec --using 22.23.1 -- node node_modules/vitest/vitest.mjs run`. Python always `py -3.11`.
  New KEK note: §7 crypto needs `PROVIDER_KEK_V<n>` in the environment; the test sets its own.

**For deeper context, read these entries only:**
- `VHE-ISSUE-LOG-0019` — the §7 build (files, exit gate, the 2 dropped generics, cost-seam split).
- `VHE-ISSUE-LOG-0018` — the owner ruling that unblocked §7.
