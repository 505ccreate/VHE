# VHE-ISSUE-LOG-0024  —  §9.2A deterministic video-repair core + provider-layer refactors (Eli Q1–Q4 rulings)

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0024 |
| **Date / time** | 2026-07-21 evening EDT |
| **Logged by** | `CC-HAIKU-01` (from AI-ACCOUNT-REGISTRY.md — self-registered this session under the owner's 2026-07-19 identifier-naming delegation) |
| **Platform / room** | Claude Code — Desktop, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §9.2 · §6.1 · §6.3 · §6.4 · §7 · §5 · §8 · VHE-4 (24h-TTL manifest pattern) |
| **Category** | Decision (Eli rulings) + Discovery (build) |
| **Status** | **RESOLVED** (build complete + green) · repair-QUALITY validation still OPEN (owner gate) |

---

## 1. What happened

The owner returned Eli's rulings on the four open questions (`OPEN-QUESTIONS-FOR-ELI_2026-07-21.md`)
and authorized a build. Rulings, verbatim intent:

- **Q1 (§9.2 timing) → BUILD §9.2A deterministic core NOW.** Exact range extraction, rational
  frame/keyframe math, absolute/local index translation, mask-only compositing, provider-output
  contract validation, preview-window assembly, mock-driven tests. **Do NOT claim §9.2 quality
  completion or begin final provider/GPU certification until the real §1 AI fixtures pass.**
- **Q2a (storage seam) → REPLACE the `0022` factory-closure** with a **versioned
  `ProviderExecutionContext`**: adapters read input buffers or request short-lived signed input
  URLs, and return provider-native bytes/URLs; the **worker/registry** owns downloading, validating,
  deterministically storing, and converting to assetKeys. (Sequenced BEFORE §9.2A.)
- **Q2c (cost) → versioned per-provider/per-model PRICING CATALOG.** Store raw usage, estimated
  cost, reported cost when available, and pricing provenance. Dashboard reconciliation stays
  authoritative when the provider returns no exact cost.
- **Q3 (manifests) → add a HYBRID manifest cache seam NOW.** Refresh on connect + after 24h, retain
  last-known-good, allow manual snapshots for providers without discovery endpoints. Do NOT pause
  §9.2 to retrofit every image adapter. Use OpenRouter's live video manifest when the gen layer begins.
- **Q4 (gen layer) → Higgsfield work stays DEFERRED.** Direction: OpenRouter-first for video
  generation, direct-provider adapters later where justified, hosted consent-gated identity
  processing before self-hosted face-swap.

(Q2b — where outputs get persisted — is answered by the Q2a design: the worker/registry persists,
not the adapter.)

Two facts established at session start, both verified on disk:
- **Suite baseline was 61/61 GREEN, not the "67/67" the prior handoff/CURRENT-STATUS claimed.** The
  working tree had no `*.test.ts` diff vs HEAD (`git diff --stat HEAD -- '*.test.ts'` empty), so the
  "67" was a prior miscount, not a regression. Corrected here and in the handoff.
- **There is no TypeScript typecheck gate in this project** — no `tsconfig.json`, no `typescript`
  dependency, no `tsc` binary. `.ts` runs via Node-22 type-stripping (types erased, never checked);
  vitest/esbuild the same. **The test suite is the validation gate.** (This matches how 0012–0022
  verified — none ran `tsc`.)

## 2. Why it matters

The `0022` findings flagged three frozen-interface gaps that block a real generation layer: the
`ProviderAdapter` had no storage seam, provider outputs were URLs/base64 not keys, and no per-call
cost exists in provider responses. Left unaddressed, every future adapter would re-invent the
factory-closure workaround, cost would stay an un-auditable estimate, and manifests would stay
hardcoded. §9.2A is the first video-repair code; getting its deterministic core right (integer frame
math, non-destructive mask compositing, preview-only rendering) is the foundation the GPU/hosted
pieces bolt onto later.

## 3. Attempted solutions

Straight build (no dead ends of note); design decisions worth recording:

1. **Additive vs. breaking §7 interface change.** The owner authorized changing the frozen §7
   surface. Chose **additive**: `submit`/`poll` gained an OPTIONAL versioned `ctx` (3rd param —
   fewer-param mocks stay assignable) and a widened success return `GenResult | ProviderNativeResult`
   (a discriminated union; legacy `{assetKeys}` still valid). The §7 mock exit gate stayed green
   untouched. **Result:** no mock/adapter breakage; the migration is opt-in per adapter.
2. **Where the cost record flows without touching frozen `routing.ts` `StepResult` or `GenResult`.**
   Considered adding `cost` to `GenResult`. **Chose** a closure-captured `winningCost` in
   `runGeneration`: each attempt sets it immediately before returning `ok`, and `walkChain` returns
   on the first `ok`, so it always reflects the winner. No frozen type touched.
3. **Preview encode string.** §0 forbids ffmpeg strings outside the §6 wrapper. The preview window
   is a numbered-PNG → mp4 encode — identical to the §6.4 Step-3 `encodeMidArgs` recipe. **Reused
   `encodeMidArgs`** rather than adding a new ffmpeg string (the command I needed was already there).

## 4. Resolution

**Refactor #1 — versioned `ProviderExecutionContext` (Q2a).** New
`packages/providers/execution-context.ts`: `ProviderExecutionContext` (version 1; `readInput`,
`signInputUrl`), the worker-side `AssetStore` seam (`load`/`signUrl`/`store`/`fetchUrl`),
`ProviderNativeOutput`/`ProviderNativeResult`, `validateProviderOutputs` (the output contract), and
`normalizeToAssetKeys` (download-if-URL → validate → content-addressed store → assetKeys). `types.ts`
`ProviderAdapter` extended additively. `registry.ts` builds the ctx, passes it to adapters, and owns
`finalizeSuccess` (normalize + cost record). Both real adapters migrated off the closure
(`ctx.readInput`, return native bytes). `adapters/storage-seam.ts` **DELETED**. Validation harness
`scripts/validate-provider-inpaint.ts` updated to an `AssetStore` + `runGenerationOpts:{store}`.

**Refactor #2 — versioned pricing catalog (Q2c).** New `packages/providers/cost-catalog.ts`:
`PRICING_CATALOG_VERSION`, per-(provider,model) entries with `rates` + dated `provenance` +
`estimateCents(usage)`, `buildCostRecord` → `{catalogVersion, rawUsage, estimatedCents,
reportedCents, provenance, authoritative:'reported'|'dashboard'}`, `costCentsOf`. The adapters'
hardcoded token rates were REMOVED and now delegate to the catalog (single source of truth).
`RunGenerationResult` gained a `cost: CostRecord`. When neither provider nor catalog yields a figure,
the §7 per-capability chain-head default is used as the estimate floor and that provenance is
stamped on the record (estimate and billed number never diverge).

**Refactor #3 — hybrid manifest cache seam (Q3).** New `packages/providers/manifest-cache.ts`:
versioned `CachedManifest` (source `live`|`snapshot`|`last-known-good`), pluggable `ManifestStore`
(in-memory now; DB later — no §2 schema touch), `makeManifestCache` with `get` (live on
miss/stale, serve fresh from cache, LKG on discovery outage), `refreshOnConnect` (forced), and
`putSnapshot` (manual pin for no-discovery providers). 24h TTL default (VHE-4 pattern). **Seam only**
— deliberately NOT wired into the hardcoded-manifest image adapters (owner: don't pause §9.2 to
retrofit). Adopted by OpenRouter's live video manifest at the gen-layer phase.

**§9.2A deterministic core (Q1).** New `packages/repair/video-repair.ts`:
- `paddedExtractionRange` / `extractionArgsForRepair` — §9.2 "[a−4 .. b+4]" over §6.3, clamped to
  clip bounds.
- `keyframeSet(a,b,stride)` — §9.2 "a, a+s, …, b (stride 4–6, always force b)"; `bracketingKeyframes`
  + `interpolationT` = §9.2 RIFE `t=(f−k1)/(k2−k1)`.
- `localToAbsolute`/`absoluteToLocal`/`keyframesInRange` — the §8 `absolute = rangeStart + local`.
- `compositeFrameUnderMask`/`compositeRangeUnderMask` — the §9.2 rule
  `out=frame·(1−m)+patch·m`, per frame, reusing §9.1 `compositeUnderMask`; unpatched frames pass
  through untouched (non-destructive).
- `validateKeyframePatchOutputs` — one image patch per keyframe (reuses §7's validator).
- `previewWindowEncodeArgs` — §9.2 "preview renders only [a−4 .. b+4]" via the §6 wrapper
  (`encodeMidArgs` reuse).

GPU/hosted §9.2 pieces (SAM 2 tracking §8, ProPainter, RIFE interpolation, provider `video.inpaint`)
remain OUT — environment-blocked (no local GPU) / deferred to the gen layer. §9.2 in VHE-2 is PROSE
(no verbatim code block, no formal exit gate — same as §9.1 per 0020); this implements the described
algorithm.

## 5. Verification

- **`vitest run` → 109/109 GREEN, 13 files** (from a corrected 61/61 baseline; +48 tests). New test
  files: `execution-context.test.ts`, `cost-catalog.test.ts`, `manifest-cache.test.ts`,
  `video-repair.test.ts`; plus migrated `openai-image.test.ts` / `gemini-image.test.ts` and added
  native-adapter + cost assertions in `providers.test.ts`.
- **Preflight re-run → PASS 13 / FAIL 4 / SKIP 1, unchanged** (the 4 FAILs are the undelivered §1 AI
  fixtures; my changes are additive `packages/` modules, no fixture/toolchain impact).
- Command: `%APPDATA%\fnm\node-versions\v22.23.1\installation\node.exe node_modules/vitest/vitest.mjs run`.
- **NOT verified (by owner gate):** repair QUALITY — no real §1 fixture, no live provider/GPU run was
  done or claimed. §9.2A is PLUMBING validated by mocks only.

## 6. Affected files / components / tests / commits

- `packages/providers/execution-context.ts` — NEW (versioned ctx + AssetStore + validate + normalize)
- `packages/providers/cost-catalog.ts` — NEW (versioned pricing catalog + CostRecord)
- `packages/providers/manifest-cache.ts` — NEW (hybrid live/snapshot/LKG cache seam)
- `packages/repair/video-repair.ts` — NEW (§9.2A deterministic core)
- `packages/providers/types.ts` — `ProviderAdapter` extended additively (optional ctx, AdapterSuccess)
- `packages/providers/registry.ts` — ctx build + `finalizeSuccess` + cost record on RunGenerationResult
- `packages/providers/adapters/openai-image.ts`, `gemini-image.ts` — migrated off the factory closure
- `packages/providers/adapters/storage-seam.ts` — DELETED (workaround retired)
- `scripts/validate-provider-inpaint.ts` — AssetStore + `runGenerationOpts:{store}`
- Tests: `execution-context.test.ts`, `cost-catalog.test.ts`, `manifest-cache.test.ts`,
  `video-repair.test.ts` NEW; `openai-image.test.ts`, `gemini-image.test.ts`, `providers.test.ts` updated
- **Commit:** _uncommitted at time of writing — see handoff (owner did not request a commit; tree is
  green and staged-clean besides logs)._

## 7. Prevention

- The versioned `ProviderExecutionContext` + `normalizeToAssetKeys` is the reusable seam that stops
  every future adapter from re-inventing a storage workaround. Harvest candidate.
- The pricing catalog with dated provenance makes a stale rate auditable and a rate change a version
  bump — prevents silent cost drift.
- The manifest cache seam's last-known-good keeps a transient discovery outage from dropping a
  working provider — a pattern worth reusing wherever a live catalog has a TTL.
- **Record-correction lesson:** the "67/67" miscount propagated across two handoffs. Verify the suite
  count against a fresh run before quoting it in a handoff.

## 8. Related entries

- `VHE-ISSUE-LOG-0022` — the three findings this resolves (storage seam, output persistence, cost).
  Q2 rulings appended there.
- `VHE-ISSUE-LOG-0023` — Higgsfield/gen-layer + manifest sourcing. Q3/Q4 rulings appended there.
- `VHE-ISSUE-LOG-0021` — §9.1 hardening; §9.2A reuses its `compositeUnderMask`.
- `VHE-ISSUE-LOG-0020` — §9.1 is prose/no-exit-gate; §9.2 is the same (this entry confirms it).

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

_(none)_
