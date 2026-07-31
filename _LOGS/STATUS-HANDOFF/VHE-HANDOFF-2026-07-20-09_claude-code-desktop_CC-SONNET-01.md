# VHE Handoff — 2026-07-20-09

| Field | Value |
|---|---|
| **Logged by** | `CC-SONNET-01` (Claude Sonnet 5) — first session on this room |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-20 midday (EDT) |
| **Project phase** | §2–§7 core done; **§9.1 image inpaint core now built + verified.** §9.2/§9.4 unblocked to build on it. |

**Keep this file short. Detail belongs in the numbered diary entries. Reference them by number.**

---

**Blueprint sections followed:** VHE-2 §9.1 (reusing §5 rasterize, §7 runGeneration, §9.2 composite rule).

**Current working state (one paragraph, factual):**
Owner picked §9.1 as the next build, then left and delegated all calls to the builder. Built
`packages/repair/inpaint.ts` + `inpaint.test.ts` (`VHE-ISSUE-LOG-0020`): mask bounding-box + 25%
margin (clamped to frame), crop-inpaint-paste, verbatim §9.1 prompt/negative template compile
(user-first precedence), per-candidate compositing via the §9.2 mask rule, and `runImageInpaint`
orchestration that calls §7 `runGeneration` with an `image.inpaint` request over **injected storage**
(loadImage/storeImage) — the same DI pattern §7 used for `query`. **§9.1 is prose in VHE-2 (no code
block, no exit gate — confirmed by extracting `word/document.xml`).** Repo on `master`, local only.
**Committed as `1f2ec39`** (owner asked to commit after the build; on top of `f687de5`). Working tree
clean except the untracked `VHE-progaress sofar_2026-07-20.zip` (progress archive, not committed).

**Completed this session:**
- Self-registered `CC-SONNET-01` in `AI-ACCOUNT-REGISTRY.md` (new model on the same account).
- Built §9.1 image inpaint core (`VHE-ISSUE-LOG-0020`) — 1 module + 1 test file under `packages/repair/`.

**Tested — with actual results:**
- `node node_modules/vitest/vitest.mjs run packages/repair/inpaint.test.ts --reporter=verbose`
  → **10/10 pass** (bbox geometry, prompt compile, candidate clamp, composite pixels, end-to-end
  with mock provider + in-memory storage).
- Full suite `node node_modules/vitest/vitest.mjs run` → **Test Files 7 passed, Tests 42 passed**
  (was 32; +10), 13.25 s — live-Postgres §4/§7/queue tests ran, no regression.
- **fnm is NOT on this shell's PATH this session.** Ran the pinned binary directly:
  `%APPDATA%\fnm\node-versions\v22.23.1\installation\node.exe`. (The `-08` handoff's
  `fnm.exe exec --using 22.23.1` command assumes fnm on PATH — it was not, in either bash or PS here.)

**Files created or changed:**
- `packages/repair/inpaint.ts` — created — §9.1 pipeline (`runImageInpaint`) + pure helpers
  (`maskBoundingBoxPx`, `compileInpaintPrompt`, `clampCandidateCount`, `cropToBox`, `compositeUnderMask`).
- `packages/repair/inpaint.test.ts` — created — 10 deterministic tests.
- `_LOGS/*` — 0020 diary, LOG-INDEX row, registry row, CURRENT-STATUS, this handoff.

**Unfinished / left mid-work:**
- Nothing mid-refactor. §9.1's two open items are clean flags, not half-done work (see below).

**Next recommended action:**
1. Read `CURRENT-STATUS.md`, then this handoff. For depth read **only** `VHE-ISSUE-LOG-0020`.
2. **§9.2 video repair** is the natural next build — it reuses `compositeUnderMask` + the §9.1 prompt
   template, adds §6.3 frame extraction + §8 mask tracking + the keyframe/RIFE or ProPainter paths.
   (§8 SAM is a Python/LOCAL_GPU-gated worker → API-only here uses the hosted-equiv / RAFT fallback.)
3. When a provider key is granted to this room, build the real `image.inpaint` adapters (§7, order
   fal→replicate→google→openai) and `runImageInpaint` will call them unchanged.

**Blockers, warnings, dependencies, open decisions:**
- ✅ **Committed** as `1f2ec39` (7 files, +810/−57; the untracked progress zip was excluded). A
  follow-up logs-only commit records this commit hash in `0020`/CURRENT-STATUS/this file.
- 🟡 **§11 "Apply" deferred** (`0020` §4): §11 edit-graph is not built, so `runImageInpaint` returns
  before/after candidates and never destroys the source; wiring the non-destructive apply node is a
  §11-time follow-up.
- 🟡 **Provider max-dim downscale of an oversized crop** flagged as an open edge (`0020` §4) — bbox is
  clamped to the frame; §7 routing already filters providers that can't hold the request, so this only
  matters as a future quality/cost optimization.
- 🟡 Prior open items unchanged: `0017` two §4 rulings await owner review; `0018`/`0019` cost-defaults
  config-table-vs-code; 4 AI fixtures still tracked debt; `0007` production worker topology.
- 🚨 System FFmpeg 8.1.2 on PATH — never bare `ffmpeg` (§6 wrapper only). Python always `py -3.11`.
  §7 crypto needs `PROVIDER_KEK_V<n>`; tests set their own. **fnm not on PATH — invoke the pinned node
  directly (path above).**

**For deeper context, read these entries only:**
- `VHE-ISSUE-LOG-0020` — the §9.1 build (design decisions, the two deferrals, verification).
