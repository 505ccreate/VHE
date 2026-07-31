# VHE-ISSUE-LOG-0028 — Video-removal lane: hosted `video.inpaint` vs hosted ProPainter-equivalent (decision memo)

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0028 |
| **Date / time** | 2026-07-23 (afternoon EDT) |
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §9.2 (video repair — the "Removal / background fix" path) · §7 (capability routing) |
| **Category** | Open decision — owner ruling required (no code, no provider chosen) |
| **Status** | **RULED 2026-07-23 evening (owner) — build authorized per §7a. Nothing implemented yet.** |
| **Baseline commit** | `52e3277` (unchanged; memo only) |

---

## 0. Why this memo exists

VHE-2 §9.2 splits video repair into two paths by instruction type (mirror lines 375–378):

- **Removal / background fix → ProPainter over the range** (temporally coherent by design). *Default.*
- **Content replacement → keyframe strategy** (inpaint keys + RIFE interpolate + composite). *Built:
  the deterministic core in `keyframe-repair.ts` / `video-repair.ts`, logs 0024/0025/0027.*
- And an override: **"Provider `video.inpaint` if a connection advertises it → route there, skip
  local work."**

The content-replacement path is built (no-spend, deterministic). The **removal path is the hole.**
Because this is an API-only launch with no local GPU (CLAUDE.md; log 0005), the blueprint's default
"ProPainter over the range" **cannot run locally here** — it must be a *hosted* service. So the real
choice the owner asked me to frame is between two hosted shapes:

- **Option A — direct hosted `video.inpaint`**: a diffusion video-inpainting endpoint that takes the
  source video + a mask and regenerates the masked region.
- **Option B — hosted ProPainter-equivalent removal**: a flow/propagation-based object-removal
  service that fills the masked region from surrounding real pixels (what §9.2 names as the default).

**Per owner directive this session, I have NOT chosen and have NOT implemented either.** This memo is
the comparison; a ruling unblocks the build.

## 1. The candidates I actually found (real endpoints, 2026-07-23)

Grounded in live provider pages, not memory. Anything I could not confirm is marked **[verify live]**.

| | **A. Direct `video.inpaint`** | **B1. ProPainter-equivalent (fal VOID)** | **B2. ProPainter itself (Replicate)** |
|---|---|---|---|
| Example endpoint | `fal-ai/wan-vace-14b/inpainting` | `fal-ai/void-video-inpainting` | `jd7h/propainter` (Replicate) |
| Method class | Diffusion regen of masked region | Object removal + scene-interaction cleanup | Flow-guided propagation inpaint (the literal ProPainter repo) |
| Mask input | `mask_video_url` (required) **or** `mask_image_url` (salient-tracking reference) | "quad mask video url" (mask **video**); optional SAM3 auto-mask add-on | mask video / per-frame masks **[verify live]** |
| Max resolution | up to **720p** (auto/240/360/480/580/720) | not stated **[verify live]** | ~720p practical **[verify live]** |
| Duration / frames | **81–241 frames**, fps **5–30** (video-sec billed at 16 fps) | not stated **[verify live]** | length bounded by GPU RAM **[verify live]** |
| Seed / determinism | **accepts `seed`** ✅ | no seed mentioned ⚠️ | flow-based ⇒ largely deterministic ✅ (no diffusion RNG) |
| Async | fal **queue** (submit→status→result) ✅ | fal **queue** ✅ | Replicate **predictions** (async) ✅ |
| Price | **$0.08/video-sec @720p**, $0.06 @580p, $0.04 @480p | **$0.05/video flat**; Pass2 → $0.10; +$0.05 SAM3 auto-mask | hardware-per-sec (~$0.0011–0.0015/s H100-class) — **per-run cost = GPU seconds, [verify live]** |
| Maintenance | actively served flagship | actively served | Replicate version last updated **2023** ⚠️ (staleness/reliability risk) |

Sources: fal Wan VACE inpainting API page; fal VOID page; fal pricing search; Replicate/ProPainter
listing + Replicate hardware-billing page (see handoff Sources).

## 2. Axis-by-axis comparison (the seven the owner asked for)

### 2.1 Cost
- **A (Wan VACE)** bills per **video-second by resolution**. A §9.2 window is `[a−4 .. b+4]` — short by
  design (preview renders only the window, never the whole clip, §9.2 line 380). A 3–5 s window @480p
  ≈ **$0.12–$0.20**; @720p ≈ **$0.24–$0.40**. Predictable, scales with clip length + resolution.
- **B1 (VOID)** is a **flat $0.05/video** ($0.10 with the higher-quality Pass2), independent of length
  within its limits. For our short windows this is the **cheapest** option by a wide margin, and the
  add-on SAM3 auto-mask ($0.05) could even *replace* part of our §8 SAM-2 tracking cost.
- **B2 (ProPainter/Replicate)** bills **GPU-seconds**; cost = run time. For short windows likely a few
  cents, but variable and only knowable after a real run **[verify live]**.
- **Read:** B1 is cheapest and most predictable for short windows; A is predictable but higher; B2 is
  cheapest-in-theory but variable and hardest to budget-gate up front (§4 budget gate wants a
  pre-spend estimate — a flat/per-second price is easier to gate than GPU-seconds).

### 2.2 Quality (removal specifically)
- The blueprint deliberately names **ProPainter for removal** because flow-propagation inpainting is
  **temporally coherent by design** — it fills from real surrounding pixels and tracks them across
  frames, so it doesn't hallucinate new content or flicker. That's exactly what "remove this object"
  wants. **B1/B2 are the on-blueprint quality choice for removal.**
- **A (diffusion `video.inpaint`)** *regenerates* the masked region. For **content replacement** that's
  the point; for **removal** it can invent texture and drift frame-to-frame. It's the stronger tool
  when the instruction is "put something else here," the weaker tool when it's "make this go away."
- Neither is verifiable without the real §1 fixtures (owner's standing quality gate — logs 0009/0011).
  **No quality claim is made here; this is a design-fit argument, not a measured result.**

### 2.3 Mask support
- Our current mask output (§5 + §8 SAM-2) is **per-frame PNG masks** at `masks/{maskId}/{abs:07d}.png`
  (white = edit). **All three hosted options want a mask _video_**, not a PNG sequence.
- **New build item regardless of choice:** encode our per-frame masks → a mask `.mp4` through the §6
  wrapper (numbered-PNG → mp4 is the existing §6.4 recipe — `encodeMidArgs`, already used by the
  preview-window assembly). This is small and deterministic, but it is *net-new* and must be logged as
  a build item, not assumed.
- **A** also offers a `mask_image_url` salient-tracking mode (single mask, provider tracks it) — a
  possible fallback when SAM-2 isn't available, paralleling the blueprint's RAFT fallback (§8 line 364).
- **B1's** optional SAM3 auto-mask could shortcut mask generation entirely for simple removals.

### 2.4 Duration / resolution limits
- **A** has explicit, router-checkable bounds: **81–241 frames, 5–30 fps, ≤720p.** These map *directly*
  onto the manifest fields we already have (`minDurationSec`/`maxDurationSec` via frames÷fps, `fps[]`,
  `maxWidth`/`maxHeight`) and onto `manifestSatisfies()` in `routing.ts` **with zero routing-code
  change.** Note the **81-frame floor**: a very short window (< ~3.4 s @24 fps) would be *rejected* by A
  and would need padding or a different lane — a real edge to design for.
- **B1/B2** limits are **not published** — a live probe is required before their manifests can state
  honest bounds. Until then their manifest limits would be guesses, which violates the "no assumptions"
  rule. **[verify live]**

### 2.5 Async job behaviour
- **All three are async**, and this is the **cleanest compatibility story of the whole memo:**
  - Both fal models use the **exact fal queue API** the built `fal-image.ts` adapter already speaks
    (`submit → status → result`, `Authorization: Key`, URL-in/URL-out). A video adapter is largely the
    image adapter with a different `modelId` and request body — the transport, error mapping
    (`mapHttp`), cancel, and poll-status handling **transfer directly.**
  - Replicate's predictions API is also submit/poll and fits the same `ProviderAdapter.submit/poll`
    contract, but it's a **second transport to write and maintain** (no Replicate adapter exists yet).
- The registry already downloads URL outputs via `normalizeToAssetKeys` + `store.fetchUrl`, and the
  presigned-S3 store (0027) already makes our inputs fetchable by the provider. **The async plumbing is
  effectively already built for the fal options.**

### 2.6 Provider reliability
- **A (Wan VACE)** and **B1 (VOID)** are **actively-served fal flagship endpoints** on the platform
  we've already integrated, keyed, and hardened against (0026/0027). Lowest operational risk.
- **B2 (Replicate ProPainter)** is the literal ProPainter model but the Replicate version is **community-
  maintained and last updated 2023.** Cold-start latency and version drift are real risks, and it pulls
  in a **whole second provider integration** (Replicate is #2 in our fallback order but has **no adapter
  built yet**). Higher operational + maintenance surface.

### 2.7 Compatibility with the existing capability router
- **`video.inpaint` is already a first-class `Capability`** in `types.ts` (the union already lists
  `'video.inpaint'`). **No enum/schema/type change is needed** for Option A — it registers under the
  capability that already exists.
- **`routeChain` / `manifestSatisfies` already filter on duration, dimensions, and mask support**
  (`routing.ts` lines 44–51). A video manifest slots into routing **with no routing changes.**
- **Naming friction for Option B:** there is **no `video.removal` capability**, and adding one would
  touch the verbatim §7 `Capability` union (a blueprint-code edit — loggable, and to be avoided if
  possible). The clean path is to **register a hosted removal service under `video.inpaint` too**
  (removal *is* a masked video edit) and let the §9.2 instruction-type classifier, not the capability
  enum, decide removal-vs-replacement. That keeps the router untouched. **This is the one genuine
  architecture question in the memo** and I am flagging it rather than deciding it.
- **Honest scope note:** the removal lane returns a **repaired video**, so it **bypasses** the built
  keyframe/RIFE/`validateKeyframePatchOutputs` math entirely (blueprint: "route there, skip local
  work"). It is a *different* output contract (one video) from the content-replacement lane (N keyframe
  patches). Both are legal §9.2 paths; they don't share the back half of the pipeline.

## 3. Summary scorecard

| Axis | Winner | Note |
|---|---|---|
| Cost (short windows) | **B1 (VOID)** | flat $0.05–0.10; A predictable-but-higher; B2 variable |
| Removal quality (design-fit) | **B1 / B2** | flow-propagation is the on-blueprint removal method |
| Mask support | tie | all need a mask-video (new small build item either way); A + B1 offer auto/salient mask shortcuts |
| Duration/res limits | **A** | only one with published, router-checkable bounds today |
| Async behaviour | **A / B1** | reuse the built fal queue transport; B2 = new Replicate transport |
| Reliability | **A / B1** | active fal flagships; B2 stale (2023) + new integration |
| Router compatibility | **A** | uses existing `video.inpaint` cap + existing routing untouched |
| Determinism (§0) | **A / B2** | A has a seed; B2 is flow-deterministic; B1 has no stated seed ⚠️ |

## 4. My read (conditional — NOT a choice; the ruling is yours)

I am not selecting a provider (per your directive). Framing the trade-off honestly:

- **If you want the blueprint's stated removal behaviour at the lowest, most predictable cost, on the
  provider we already integrated, with almost no new plumbing → lean B1 (fal VOID).** Its open questions
  are: no published duration/resolution limits (**[verify live]**) and no stated seed (a determinism
  concern under §0 — needs confirmation that identical inputs give identical output, or a documented
  waiver like the RIFE/GPU ones).
- **If you want the strongest router-fit, published limits, and a seed for determinism today, and are
  willing to pay more and accept that diffusion regen is a weaker fit for pure "make it disappear"
  removals → lean A (Wan VACE `video.inpaint`).** This also directly satisfies the §9.2 "provider
  `video.inpaint` if advertised → route there" override clause.
- **B2 (Replicate ProPainter)** is the literal blueprint tool but carries the most operational risk
  (2023 model + a brand-new second-provider integration). I'd hold it as a fallback, not the first
  build, unless you specifically want the reference ProPainter output.

A reasonable **non-lock-in** posture (and the one I'd suggest if you want to preserve optionality):
build the **fal video adapter once** against the fal queue transport we already have, and let it expose
**both** `wan-vace` (A) and **VOID** (B1) as selectable models behind the same adapter — the router
picks by manifest, you A/B them on the real fixtures, and nothing is locked in. But **that is still a
build I will not start without your yes.**

## 5. Open questions for the owner (ruling needed before any implementation)

1. **Which lane(s) do I build first** — A (Wan VACE `video.inpaint`), B1 (VOID), B2 (Replicate
   ProPainter), or the "one fal adapter exposing both A + B1" option in §4?
2. **Capability mapping:** OK to register a hosted removal service under the existing **`video.inpaint`**
   capability (keeps the router + verbatim §7 union untouched), rather than adding a new `video.removal`
   enum value?
3. **Determinism:** for a seedless removal model (B1/VOID), is a **documented determinism waiver**
   acceptable (as with the GPU/RIFE pieces), or is a seed a hard requirement (which would favour A)?
4. **Live limits probe:** may I do a **zero- or near-zero-cost metadata/limits probe** of B1/B2 to fill
   in the **[verify live]** cells (resolution/duration bounds), or should that wait until you've also
   supplied the fixtures and we do it as part of the first real run? (No repair spend either way without
   your go — this would only be a schema/limits check.)
5. **Mask-video encoder:** confirm I should build the small **per-frame-PNG-masks → mask.mp4** step via
   the §6 wrapper (`encodeMidArgs`) as the shared prerequisite for whichever lane wins — it's needed by
   all three.

## 6. What I did / did NOT do this session

- **Did:** read the built seam (`types.ts`, `routing.ts`, `fal-image.ts`, `video-repair.ts`) + VHE-2
  §9.2 mirror; researched live provider endpoints/pricing; wrote this memo; claimed + indexed 0028.
- **Did NOT:** change any code, choose a provider, add a capability, make any provider call, or spend a
  cent. Suite/preflight untouched since 0027 (**153/153 · 13/4/1**), not re-run (no code change).

## 7a. Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

### 2026-07-23 (evening) EDT — Owner ruling on §5, all 5 questions answered

Owner (elisoren428, via chat) returned rulings on every open question in §5. **Status changes from
"DECISION — awaiting owner approval" to "RULED — build authorized, not yet started."** Recorded
verbatim in substance, nothing implemented this session (session ending on time budget):

1. **Lane:** Build **B1 (fal VOID)** first, as the dedicated object-removal lane. **Wan VACE (A) is
   reserved for content-replacement / generative inpainting, NOT the default removal tool.**
   **Replicate ProPainter (B2) is NOT integrated at this stage.**
2. **Capability registration:** Register VOID under the **existing `video.inpaint`** capability. **Do
   NOT** add a `video.removal` enum or alter the frozen §7 `Capability` union. Distinguish the
   operation via **adapter manifest metadata or a validated request field, e.g. `extra.operation =
   "remove"`** — implementation detail left to the builder, but the enum stays untouched.
3. **Determinism:** A seedless provider is acceptable **only as provider-output variability, not
   pipeline nondeterminism**. Requirements for the eventual build:
   - The exact returned artifact **must be cached and reused**.
   - **Retries must return the existing job/result**, never silently re-call the provider.
   - **Lineage must record:** model/version, source hash, mask hash, request parameters, returned
     asset. (This is a NEW cross-cutting requirement beyond what any prior §7/§9 module implements —
     flag for the builder who picks this up: no existing module has a lineage table/record shape yet.)
4. **Limits probe:** Authorized — **strictly zero-spend metadata/schema probe only.** Explicitly
   FORBIDDEN: submitting media, enqueuing inference, or any call that could create a charge. **If
   cost behavior is uncertain, STOP and ask first** — do not guess-and-proceed.
5. **Mask-video encoder:** Approved as the shared prerequisite, but **gated**: no new FFmpeg command
   may go outside the §6 wrapper, and VHE-2 must not be quietly rewritten. **Owner requires a
   SEPARATE additive removal-lane specification be written and logged FIRST**, covering:
   - per-frame PNG masks → deterministic `mask.mp4`
   - exact source fps, dimensions, frame count, frame alignment
   - provider-required mask polarity and pixel format
   - wrapper-only implementation plan + golden-test plan
   **Only after that spec is logged** may the encoder, a mock VOID adapter, routing tests, caching,
   and lineage handling be implemented — **against no-spend fixtures / synthetic test media only. No
   live inference, no provider spend, this ruling does not authorize either.**

**Nothing built this session under this ruling** — session ended on time/usage budget immediately
after the ruling was received. The additive removal-lane specification (item 5) is the correct FIRST
build task for the next session, before any encoder/adapter/test code.

## 7. Related entries

- `VHE-ISSUE-LOG-0027` — §9.2 **content-replacement** orchestration + S3 presign (the built half; this
  memo is about the **removal** half).
- `VHE-ISSUE-LOG-0026` — the fal image adapter whose **queue transport** a fal video adapter reuses.
- `VHE-ISSUE-LOG-0024` / `0025` — §9.2A / §9.5 deterministic cores the removal lane sits beside.
- `VHE-ISSUE-LOG-0018` — provider fallback order (fal → Replicate → Google → OpenAI): fal-first is why
  the fal options (A/B1) have the lightest integration cost.
- `VHE-ISSUE-LOG-0007` — deferred production worker topology (a hosted removal job is long-running →
  relevant when that gets decided).
