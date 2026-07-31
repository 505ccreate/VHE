# VHE-ISSUE-LOG-0031 — REVISED removal-lane specification (successor to 0029): mask-video encoder + one-fal-adapter VOID contract, folding all 14 review items + the owner's 2 design decisions

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0031 |
| **Date / time** | 2026-07-24 (evening EDT) |
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §9.2 (video repair — removal path) · §9.5 (chunked windows) · §7 (routing/adapters/registry) · §6 (FFmpeg wrapper) · §5 (mask format) · §8 (SAM-2 tracking) |
| **Category** | Specification (design artifact) — the **revised** removal-lane spec required by the `0029` correction (Eli 14-item review) + the owner's two design rulings |
| **Status** | **SPEC — written, awaiting RE-REVIEW. NOTHING built, NOTHING probed, NO spend. Supersedes `0029` for implementation.** |
| **Baseline commit** | `52e3277` (unchanged; spec only, no code) |
| **Supersedes** | `VHE-ISSUE-LOG-0029` for implementation. `0029`'s filed body remains as history; its appended correction is folded in here. **Where `0029` and `0031` conflict, `0031` governs.** |

---

## 0. Why this entry exists (and what it is NOT)

`VHE-ISSUE-LOG-0029` was the first removal-lane spec. Eli source-audited it and returned **14 required
revisions** (recorded as the signed correction appended to `0029`, 2026-07-24 afternoon), several of
which **reverse or correct** claims in the `0029` filed body — all verified against the built code at
`52e3277`. The owner's ruling was: **revise the spec first and STOP for re-review**; run only the
zero-spend probe second (after explicit key/network approval); build the encoder third.

The revised spec was blocked on two open design questions that were sitting with Eli. The owner has now
relayed both answers (§1). **This entry is the revised specification** — it folds in all 14 correction
items and both decisions into one coherent implementation contract, so a future builder (possibly a
different model/platform) can implement the removal lane **without re-deriving anything and without
guessing**.

Explicitly, in producing this entry:

- **No code was written.** HEAD is still `52e3277`; suite/preflight untouched (153/153 · 13/4/1, not
  re-run because nothing changed).
- **No provider was called.** No probe, no submission, no spend. The zero-spend probe (0028 ruling #4)
  is *specified* here (§11), not *executed*, and remains gated on explicit owner approval of key/network
  use.
- This spec is **additive** to VHE-2. It does **not** modify the frozen §7 `Capability` union
  (`video.inpaint` already exists). It **does** require additive, logged type/routing/storage changes
  (§3, §8, §9) — those are §7-block deviations of the `0016`/`0018` class and MUST be logged as such
  **when built**, not silently.
- Where a fact is not yet verifiable it is marked **[VERIFY — zero-spend probe]** and MUST NOT be
  assumed true at build time.

This entry does **not** re-explain everything `0029` already established correctly (the §5 rasterizer,
the §6 wrapper as the only home for ffmpeg strings, the fal queue transport shape, the sibling
content-replacement lane). It **restates the parts the correction changed**, folds in the two decisions,
and specifies the net contract. Read `0029` §1 and §9 for the unchanged background; read **this** entry
for what to build.

---

## 1. The two open decisions — now RESOLVED by the owner (relayed from Eli)

Both questions that paused the previous session are answered. They are recorded here verbatim-in-substance
and are **settled** — do not re-litigate.

### Decision 1 — fal adapter registry (resolves correction **item 4**)

> Use **one registered fal adapter keyed by provider slug (`fal`)**, with **internal capability/model
> dispatch**. The adapter shares authentication, submission, polling, cancellation, error mapping, and
> capability discovery, while **delegating individual operations to capability-specific modules** — the
> existing image handler and the new VOID removal handler.
>
> **Do NOT** change the global registry to `slug+capability` for this lane. Provider connections, keys,
> manifests, defaults, cost attribution, and fallback history are **provider-level state** and remain
> unified under one `fal` registration.

**Consequence:** correction item 4 offered options (a) one multi-capability adapter vs (b) a
`slug+capability` registry. **Option (a) is chosen.** The registry (`registry.ts:35-39`,
one `Map<string, ProviderAdapter>` keyed by `adapter.slug`, resolved by `getAdapter(conn.providerSlug)`
at `registry.ts:162`) is **unchanged**. See §4.

### Decision 2 — missing masks inside `[a..b]` (resolves correction **item 9**)

> **Hard-fail before provider submission for v1.** Do NOT use hold-last-frame or naive interpolation.
>
> The pipeline **may attempt ONE targeted re-track** of the affected span using the **nearest valid
> tracked mask as a new seed**. After that attempt, **every frame inside `[a..b]` must have a valid
> mask**. If any remain missing, **fail with `MASK_TRACK_GAP`, include the missing frame indices, and
> make no provider call.**
>
> **Black masks remain valid ONLY** for deliberate temporal-padding frames **outside** `[a..b]`.
>
> Bidirectional optical-flow recovery for tiny interior gaps **may be considered later** as a separately
> specified and tested fallback, **but it is NOT included in the initial `0029`/`0031` implementation.**

**Consequence:** correction item 9 left the fallback policy open ("hard-fail, or an owner-approved
fallback"). It is now **hard-fail with exactly one re-track attempt**. See §5.4.

---

## 2. Ground truth: built seams, CORRECTED where `0029` §1 was wrong

Line references are to `52e3277`. This section supersedes `0029` §1.3 and §1.5 (which the correction
reversed). The rest of `0029` §1 (the §5 rasterizer §1.1, the §6 wrapper §1.2, the fal transport §1.4)
stands unchanged and is not repeated.

### 2.1 `GenRequest` is image-semantic only — no typed video source (correction item 1)

`types.ts:41-55`: `GenRequest` carries `sourceImageKey?` and `maskKey?`, **both image-semantic**, a
float `fps?: number`, and a free-form `extra?`. `0029` §1.3 leaned on reusing `sourceImageKey`/`maskKey`
and `extra.operation` for the video lane — **that was wrong**. The removal lane needs typed video fields
and a rational fps (§3).

### 2.2 `manifestSatisfies` filters capability/dims/duration/mask only — NO fps, NO operation (items 2, 3)

`routing.ts:41-52` (verbatim §7 filter): checks capability present, `width/height ≤ maxWidth/maxHeight`,
`durationSec` within `min/maxDurationSec`, and `supportsMask` when `maskKey` present. **There is no fps
branch and no operation branch, and `routeChain` reads none of `req.extra`.** Therefore `0029` §1.3's
"a `video.inpaint` manifest slots in with ZERO routing-code change" and §5.1's "zero routing change" are
**both wrong**. fps gating and operation gating must be **added** (§3.3, §3.4).

### 2.3 The execution context is INPUT-ONLY — an adapter cannot build/persist a provider-ready mask (item 5)

`execution-context.ts:55-61`: `ProviderExecutionContext` exposes only `readInput` + `signInputUrl`. The
persist side (`AssetStore.store`, `.fetchUrl`) is deliberately withheld from adapters
(`execution-context.ts:30-48, 94-101`; the registry keeps the output side to itself). `0029` §4's "the
adapter inverts / the encoder emits provider polarity" is **not implementable in the adapter**. The
**worker/pipeline** must materialize the provider-ready mask before submission (§5).

### 2.4 The registry is keyed by slug alone (item 4 — now resolved by Decision 1)

`registry.ts:35` `new Map<string, ProviderAdapter>()`; `registerAdapter` does `set(adapter.slug, …)`
(`:37-39`); `runGeneration` resolves `getAdapter(conn.providerSlug)` (`:162`). One adapter per slug.
Per **Decision 1**, this stays as-is; the single `fal` adapter dispatches internally (§4).

### 2.5 Extensionless provider outputs are mis-typed as `image/png` (item 13)

`AssetStore.store(bytes, hint)` (`execution-context.ts:45`) has **no MIME parameter**;
`normalizeToAssetKeys` (`:173-198`) passes `hint = "<slug>-output-<contentTag>"` — **no extension** — and
never threads `ProviderNativeOutput.mimeType` (which exists at `:64-70`) into `store`. The S3 store's
`guessContentType` (`s3-store.ts:192`, per the `0029` correction) then defaults extensionless keys to
`image/png`. **A VOID `video/mp4` result would be stored and served as `image/png`.** Fix in §8.3.

### 2.6 In-memory `providerJobId` → double-pay risk on crash (item 11)

`registry.ts:161-181`: `attempt()` holds `submitted.providerJobId` in a **local variable**, then
`pollToTerminal` (`:82-101`) polls it; `walkChain` **falls through to the next provider on any thrown
error** (including `PROVIDER_TIMEOUT` at `:98`). A crash/timeout after submit but before completion can
resubmit or fall through **while the first PAID job is still live**. Fix in §9.

### 2.7 The sibling lane and the compositing back half (item 10 — reverses `0029` §1.5)

`0029` §1.5 said removal "bypasses the compositing back half entirely." **The correction reverses this.**
A removal provider can alter unmasked pixels; we must **not** ship its frame wholesale. The removal lane
**does** composite back — under the **soft local blend mask**, over the **original** frames — exactly the
§9.2 `out = frame·(1−m) + patch·m` discipline the content-replacement lane already uses (§8.2).

---

## 3. Request model & routing changes (corrections items 1, 2, 3)

All of these are **additive, logged §7 deviations** (`0016`/`0018` class) to be made **when built**.

### 3.1 Typed video-input fields on `GenRequest` (item 1)

Add explicit, typed video-input fields rather than overloading the image keys:

- **`sourceVideoKey?: string`** — the extracted source-window video asset (the padded window, §6.4).
- **`maskVideoKey?: string`** — the **provider-ready** mask-video asset (§5.3). Distinct from `maskKey`
  (which stays image-semantic for `image.inpaint`). Same field family, capability-dependent meaning,
  documented at the adapter boundary.

Do **not** overload `sourceImageKey`/`maskKey`. This is an additive change to the verbatim §7 `GenRequest`
block and MUST be logged as a §7 type deviation when made.

### 3.2 Rational fps on the request (item 2)

`GenRequest.fps?: number` is a **float** and cannot represent `30000/1001` — and its presence in code
violates §0's "floating-point fps never appears." Add **`fpsNum?: number` + `fpsDen?: number`** to the
video request path (the existing float `fps` stays only for any legacy image path that already used it;
the video lane MUST use the rational pair). Never derive a float from them in code.

### 3.3 fps gating in `manifestSatisfies` (item 2)

Extend `manifestSatisfies` (`routing.ts:41`) to filter on fps: the manifest advertises accepted rational
rates and the filter rejects a request whose `fpsNum/fpsDen` is not among them. The manifest's existing
`fps?: number[]` field (`types.ts:31`) is a **float array** and is inadequate for rational rates — the
video capability must advertise rational rates (e.g. `fpsRates?: {num:number;den:number}[]`), added as a
logged manifest change. The §12 golden test for this MUST **fail-first against a stubbed (no-op) filter**
to prove the new branch actually bites.

### 3.4 Operation as a validated request field + manifest metadata (item 3)

`extra.operation="remove"` does **not** make a provider removal-capable and is never read by routing.
Instead:

- Keep the `video.inpaint` **enum** (ruling #2 unchanged — no new capability enum).
- Add **validated supported-operation metadata to the manifest**: e.g.
  `operations: ('remove'|'replace')[]` on the `video.inpaint` capability entry.
- Carry the requested operation as a **validated `GenRequest` field** (e.g. `operation?: 'remove'|'replace'`),
  NOT free-form `extra`.
- **Filter on it in `manifestSatisfies`**: a `remove` request only routes to a connection whose
  `video.inpaint` manifest lists `remove` in `operations`.

Net for item 3: **a manifest change AND a routing change** — not zero, correcting `0029` §5.1.

---

## 4. Adapter architecture — ONE fal adapter, internal dispatch (Decision 1 / item 4)

Per **Decision 1**, there is exactly **one registered fal adapter** (`slug: 'fal'`). The global registry
is **unchanged** (still `Map<slug, adapter>`; §2.4). The single adapter owns the **provider-level**
concerns and **dispatches internally**:

**Shared by the one fal adapter (provider-level, unified):**
- Authentication (`Authorization: Key <FAL_KEY>`), submission, polling, cancellation, error mapping
  (`mapHttp`), capability discovery (`describeCapabilities`), cost attribution, fallback history.
- These stay unified under one `fal` connection/registration; they are NOT split per capability.

**Dispatched internally to capability/model-specific modules:**
- `image.inpaint` → the **existing image handler** (today's `fal-image.ts` logic).
- `video.inpaint` + `operation:'remove'` → the **new VOID removal handler** (this lane).
- Dispatch key = `req.capability` (and model where a capability maps to multiple models).

**Refactor shape (build-time, logged):** today `fal-image.ts` *is* the whole adapter. The build refactors
it into: one `fal` adapter object implementing `ProviderAdapter` (the registered thing), delegating
`submit`/`poll`/`cancel` to a per-capability module selected by `req.capability`. The image module's
observable behavior must be **unchanged** (its existing tests must stay green — this is a structure
refactor, not a behavior change). The VOID module reuses the fal queue transport (submit→poll→result,
`0029` §1.4) with a different `modelId`, a **source-video** signed URL + a **mask-video** signed URL as
inputs, and a **video** URL output. **No `slug+capability` registry key.**

**Adapter boundary contract for the mask (ties to §2.3 / §5):** the adapter receives, via the request,
the key of an **already-provider-ready** mask video (correct polarity/format/resolution). The adapter
**does not** invert, threshold, reformat, or re-encode the mask — it only `signInputUrl`s the two input
keys and submits. All mask preparation happens in the worker (§5), because the adapter's execution
context is input-only (§2.3).

---

## 5. Mask lifecycle — TWO masks, worker-materialized, hard-fail on gaps (items 5, 9, 10; Decision 2)

This is the most-changed area versus `0029`. Two distinct mask artifacts are maintained end-to-end; the
worker (not the adapter) produces them; a gap inside the edit range is a hard error.

### 5.1 Two masks, never conflated (item 10)

| Mask | Polarity/format | Who consumes it | Purpose |
|---|---|---|---|
| **Hard provider decision mask** | thresholded/binary, provider-required polarity & pixel format (§11 probe) | sent to VOID as `maskVideoKey` | tells the provider **which pixels to erase** — must be a crisp decision signal |
| **Soft local blend mask** | §5 feathered, canonical **white=edit** | the worker's compositor | blends the provider's repaired pixels back over the originals (§8.2) |

They are **different artifacts** with different polarity/edge treatment and are hashed separately (§9).
`0029` conflated them; this spec keeps them apart.

### 5.2 Canonical internal masks stay white=edit (item 5)

The canonical §5 masks the tracker/rasterizer produce are **unchanged**: white (255) = edit, black (0) =
keep, optionally feathered (`packages/masks/masks.ts`, `0029` §1.1). Nothing in this lane changes the
canonical mask convention.

### 5.3 The WORKER materializes the provider-ready mask before submission (item 5)

Because the adapter's context is input-only (§2.3), the **worker/pipeline** — not the adapter:
1. rasterizes the per-frame canonical masks over the window (§6),
2. derives the **hard provider decision mask** at the polarity/pixel-format/resolution the §11 probe
   established (thresholding away the §5 feather if the probe says VOID wants hard-binary; inverting if
   VOID wants black=edit — the same inversion precedent as the OpenAI image adapter),
3. encodes it to the provider-ready **mask video** (§6),
4. **stores it** and passes its `maskVideoKey` in the request.

The worker records the **hashes of BOTH** the canonical mask sequence and the provider-ready mask video
(feeds lineage, §9).

### 5.4 Missing mask inside `[a..b]` — hard-fail with one re-track (Decision 2 / item 9)

Define the window as §9.2's `paddedExtractionRange = [a−pad .. b+pad]`, clamped to clip bounds (the same
window the content-replacement lane extracts). For **every** absolute frame `f` in the window, exactly one
of:

- **`f ∈ [a..b]` (the true edit range):** MUST have a **valid tracked/drawn mask**. If missing:
  1. **Attempt exactly ONE targeted re-track** of the affected span, seeded from the **nearest valid
     tracked mask** (§8 SAM-2 tracker), as a new seed.
  2. After that single attempt, re-check every frame in `[a..b]`.
  3. If **any** frame in `[a..b]` still lacks a valid mask → **fail with `MASK_TRACK_GAP`**, include the
     **list of missing frame indices** in the error, and make **no provider call, no encode, no spend**.
  - **Never** silently fill an interior gap with black (that lets the removed object flash back), and
    **never** hold-last-frame or naive-interpolate in v1.
- **`f` in the temporal pad, OUTSIDE `[a..b]`:** an **all-black (no-edit)** frame at `W×H` is correct and
  required (the encoder needs a contiguous `%07d.png` run; §6.3).

`MASK_TRACK_GAP` is a new §4.3-class terminal error code (honest failure, no fall-through). The black
filler frame is produced by a **dedicated black-frame helper** (a direct `sharp`-generated black PNG at
`W×H`), **never** a schema-violating empty `MaskObject` (`MaskObject` requires `shapes.min(1)`, so an
"empty mask" is illegal per §5, per the correction).

Bidirectional optical-flow recovery for tiny interior gaps is **explicitly out of scope for v1** (Decision
2) — if pursued later it is a separate spec + separate tests, gated on owner approval.

---

## 6. Mask-video encoder — non-binding recipe, decoded-frame identity mandatory (items 6, 7)

### 6.1 Codec/container/pixel-format are DEFERRED to the probe (item 6)

`0029` §3.2 proposed a concrete `libx264 -qp 0 -pix_fmt gray -threads 1` recipe. Per the correction, that
recipe is **NON-BINDING**. `mask.mp4` presupposing x264-in-mp4 is itself an unproven assumption; a truly
lossless intra codec (FFV1) needs a container the provider decodes (MKV, not mp4), and `qp` is an x264
knob, not an FFV1 one. **The codec, container, and pixel format are decided only by the zero-spend probe
(§11)** against VOID's *accepted input formats*. Whatever is chosen:

- The recipe lives **only** in the §6 wrapper (`packages/media/ffmpeg.ts`) — the sole legal home for an
  ffmpeg string (§0 rule 3, 0028 ruling #5). Proposed builder name `encodeMaskVideoArgs`, finalized after
  §11. It must **not** reuse `encodeMidArgs` (that recipe is lossy `-crf 18 yuv420p` — softens the mask
  decision boundary; `0029` §3.1's argument stands).
- The mask must survive encoding such that its **decision boundary is preserved** (lossless or
  visually-lossless as the probe requires).

### 6.2 Determinism: decoded-frame identity is MANDATORY; byte-identical is OPTIONAL (item 6)

Supersedes `0029` §3.4's Tier A/B framing:

- **MANDATORY (was "Tier B"):** decode both encodes of the same inputs to frames and assert **every frame
  is pixel-identical**. This is the required determinism guarantee.
- **OPTIONAL (was "Tier A"):** byte-identical container across runs — a bonus only, kept **only if**
  achievable with the finalized recipe (+ any `bitexact` flag), dropped without concern if container mux
  metadata proves non-deterministic.
- The lineage **mask hash** (§9) is the hash of the **canonical decoded-frame sequence** (or the raster
  inputs), so it is stable even when the container is not.

### 6.3 Source-alignment contract (unchanged from `0029` §3.3, minus the fill-rule correction)

The provider-ready mask video is a **frame-exact twin** of the extracted source window: identical rational
`fpsNum/fpsDen`, identical `W×H` (the **processing** resolution, §7), exact padded-window frame count, and
mask frame at absolute index `f` ↔ source frame `f` (enforced by numbering mask PNGs `%07d.png` with
`-start_number = padded.start`, matching `extractFrameRangeArgs`). The fill rule is now §5.4 (interior gap
= hard-fail; pad-only frame = black), **not** `0029` §3.3's "black for either" wording.

### 6.4 Provider-minimum duration — pad BOTH, then trim the output (item 7)

The mask-video duration equals the **submitted source-window** duration exactly. **When the window is
below the provider's minimum** duration/frame-count (0028 flagged Wan VACE's 81-frame floor; **VOID's floor
is [VERIFY — probe]**):

1. **Pad the source AND the mask together** up to the provider minimum (the padded region masked black =
   no-edit, so the provider does nothing there),
2. submit,
3. **trim the repaired output back** to the true window before compositing/splice.

No fixed/one-second mask. Source and mask are always padded/trimmed **in lockstep**.

---

## 7. Resolution handling — choose before routing, transform both, composite back at native (item 8)

`routing.ts:44` rejects `req.width/height > cap.maxWidth/Height` **at filter time** — so `0029` §3.3's
"if the provider downscales internally, source+mask together" happens **too late** (routing already
dropped the connection). Corrected flow:

1. **Before routing**, choose a **provider-compatible processing resolution** (≤ the manifest's
   `maxWidth/maxHeight` for the target connection's `video.inpaint`).
2. Transform **source AND mask together** through the §6 wrapper to that processing resolution (a §6
   scale recipe — again, the only legal home for the ffmpeg string).
3. Route + submit at the processing resolution (so `manifestSatisfies` admits it).
4. **Composite the repaired result back at NATIVE resolution** (§8.2) — upscale the repaired masked
   region as needed and blend under the native-resolution soft local mask.

The `GenRequest.width/height` sent to routing are the **processing** dimensions; the native dimensions are
retained by the worker for the final composite.

---

## 8. Output handling — validate, composite only masked pixels, fix MIME (items 10, 13)

### 8.1 Validate the provider video before trusting it (item 10)

The returned video is validated (via the §6 `probe` + the `OutputContract` seam,
`execution-context.ts:112-159`, `expectMimePrefix:'video'`): width, height, **rational** fps, frame count,
and duration must match the submitted window (post-trim, §6.4). A mismatch is a `PROVIDER_REJECTED`
terminal error, not a silent accept.

### 8.2 Composite ONLY the masked pixels under the SOFT local mask (item 10 — reverses `0029` §1.5)

A removal provider can alter unmasked pixels; do **not** ship its frame wholesale. Decode the validated
provider video and, per frame, composite **only the repaired (masked) pixels beneath the feathered soft
LOCAL blend mask (§5.1) over the ORIGINAL frames**, then rebuild + splice — the same
`out = frame·(1−m) + patch·m` discipline the content-replacement lane already uses. The **hard provider
decision mask** (sent to VOID) and the **soft local blend mask** (used here) are **separate artifacts**
(§5.1), never the same one.

### 8.3 Preserve native output MIME + bounded download (item 13)

Extend the storage seam so the provider-native output MIME is **preserved end-to-end**:
- thread `ProviderNativeOutput.mimeType` (`execution-context.ts:64-70`) through `normalizeToAssetKeys`
  (`:173-198`) into `AssetStore.store(...)` — which means **adding a MIME parameter to `store`**
  (`:45`, currently `store(bytes, hint)`), a logged storage-seam change, so `s3-store.ts:192`
  `guessContentType` no longer defaults a `video/mp4` to `image/png` (§2.5).
- add a **bounded/streaming download policy** to `fetchUrl` (`:47`) — provider videos are large; no
  unbounded in-memory buffering. Enforce a max-bytes ceiling (config) and fail closed past it.

---

## 9. Durable job claim, cache, retry-dedup & lineage (items 11, 12)

### 9.1 Durable claim + persist-jobId-after-submit + no fall-through once accepted (item 11)

Correcting §2.6's in-memory/local-variable `providerJobId`:

- A **durable provider-operation/cache claim** keyed by a unique **cache key** (§9.2) is written before
  submit.
- **Persist `providerJobId` immediately AFTER submit, BEFORE polling** (durably, not a local var).
- Once a provider has **accepted** a job, retries **resume polling that same job** and **never resubmit,
  never auto-fall-through** to the next provider (unlike the current `walkChain` fall-through at
  `registry.ts:177-180`). Fall-through is only legal **before** a paid submission is accepted.
- The zero-spend probe (§11) MUST also check whether **fal supports a client idempotency key** — if so,
  send it on submit as defense-in-depth against double-pay.

This is a change to the removal lane's orchestration relative to the generic `walkChain`; it does not
alter the image lane's behavior.

### 9.2 Durable cache + lineage record (item 12, deepens `0029` §5.2)

A **durable operation/cache record** holds:

| Field | Source | Purpose |
|---|---|---|
| `state` | worker | claim/in-flight/succeeded/failed |
| `providerJobId` | fal `request_id` | retry-dedup: poll, never resubmit (§9.1) |
| `model` + `modelVersion`/`schemaRevision` | adapter (`fal-ai/void-…` + resolved version) | reproducibility; provider drift |
| `sourceVideoHash` | sha256 of the extracted source-window video | cache key input; provenance |
| `providerMaskHash` | sha256 of the **provider-ready** mask video (§5.3) | cache key input; polarity/format provenance |
| `canonicalMaskHash` | sha256 of the **canonical** decoded mask sequence (§6.2) | provenance; ties the two masks |
| `requestParams` | normalized request (capability, `operation`, processing dims, `fpsNum/fpsDen`, `durationSec`, any Pass2/SAM3 flags) | cache key input; audit |
| `resultAssetKey` | the stored repaired-video asset | the cached artifact returned on replay |
| `costCents` + `costProvenance` | cost-catalog/dashboard (fal returns no exact cost, 0026) | budget accounting |
| `createdAt` | — | ordering |

**Cache key** = stable hash of `{model, modelVersion, sourceVideoHash, providerMaskHash, requestParams}`.
Behavior: **hit** → return `resultAssetKey`, zero provider calls, zero spend; **known in-flight job** →
poll the recorded `providerJobId`, never a second submit; **miss** → submit once, record the row, serve
from cache thereafter.

**Apply-time lineage edge (item 12):** the **media asset and the `inpainted_from` lineage edge are created
when the user APPLIES the result**, NOT at repair time. This intersects the still-**deferred** §11
"Apply"/edit-graph work (`0020`/`0021`) — **flagged as a dependency**: the removal lane produces a cached
repaired-video asset + operation record now; the edit-graph edge is wired when §11 Apply is built.

This record extends the versioned-context / cost-catalog patterns already established in `0024`
(`ProviderExecutionContext`, cost-catalog provenance) — **extend, do not fork**. Where it physically lives
(new table vs. extension of the job row) is a build-#5 implementation decision, not pre-decided here; the
fields + behavior above are the contract.

---

## 10. §9.5 chunked-removal window contract (item 14)

The filed `0029` treated removal as a single window and never integrated §9.5 chunking (built in
`chunked-repair.ts`, `0025`: W=48/O=8, global keys/seed, deterministic child ids, restart selection,
overlap blend). The removal lane MUST obey the same discipline:

- **One source video + one mask video per child window** (each child window encoded per §6, masked per §5).
- **Deterministic child cache keys** (§9.2) so a resumed run **reuses accepted child jobs without
  resubmission** — ties directly to §9.1 durable claim.
- **Overlap blending** of adjacent child outputs (the same mask-only overlap blend + SSIM the deterministic
  core already enforces), output assembly, then final splice.
- **Global key/global seed/window discipline** identical to `chunked-repair.ts` — removal does not invent a
  parallel chunker.

---

## 11. Zero-spend probe plan (rulings #4, #5; item 6) — updated, STILL GATED

The probe reads **schema/metadata ONLY** — no media upload, no enqueue, no inference, nothing that can
bill. **It remains gated on the owner's explicit approval of key/network use** (owner ruling; the fal key
file location is known but its contents have NOT been read). **If any endpoint's cost behavior is
uncertain, STOP and ask the owner** (0028 ruling #4).

**[VERIFY — zero-spend probe] items** (updated from `0029` §4):

1. **Mask polarity** — does VOID erase the **white** or **black** region? (Drives §5.3 worker inversion.)
2. **Mask pixel format / channels** — greyscale / RGB / a 4-channel "quad" mask (fal's page literally
   says "quad mask video url") / alpha-encoded? (Drives §6.1 pixel format.)
3. **Hard-binary vs soft mask** — thresholded 0/255, or does it accept a feathered edge? (Drives whether
   §5.3 thresholds the feather away for the provider decision mask.)
4. **Accepted codec / container** — what decoder input does VOID accept (mp4/x264? mkv/FFV1? something
   else)? This, with #2/#3, **finalizes the §6.1 encoder recipe** — which is why the recipe is non-binding
   until the probe returns.
5. **Duration / resolution / fps bounds** — VOID's `minDurationSec`/`maxDurationSec`/`maxWidth`/`maxHeight`/
   accepted rational fps rates — fills the `video.inpaint` manifest with **honest** values (drives §6.4
   provider-minimum and §7 processing resolution). Until then the manifest states no invented bounds.
6. **Seed / determinism surface** — confirm VOID exposes no seed (ruling #3 accepts a seedless provider
   *because* the pipeline caches/dedups/records lineage, §9).
7. **Idempotency key support** — does fal accept a client idempotency key on submit? (§9.1 double-pay
   defense.)
8. **Exact request/response schema** — field names for the source-video URL, mask-video URL, any
   Pass2/SAM3 flags, and the output video URL shape — so the VOID module (§4) mirrors the real contract.

**Until the probe resolves #1–#4, no mask video may be built to a locked format or submitted** — a wrong
polarity/format wastes the owner's first real spend or silently masks the wrong region. **If metadata alone
cannot prove polarity or the accepted decoder format, STOP and report that a separately-approved minimum
inference test would be required** — do not guess.

---

## 12. Golden-test plan (all synthetic, no network, no spend)

All tests use **synthetic** masks/frames, run under the existing Vitest setup, go through the §6 wrapper
(vendored 7.1.1), and hit **no network**.

### 12.1 Encoder correctness
- **Alignment** — synthetic window `[a..b]` with a known moving white square per frame; encode; decode;
  assert decoded frame at absolute `f` equals the rasterized mask for every `f` in the window
  (IoU = 1.0 under a lossless/decision-preserving recipe).
- **fps/dims/frame-count** — probe the produced mask video (§6 `probe`): `r_frame_rate` = source
  `fpsNum/fpsDen` exactly, `width/height` = processing `W×H`, frame count = window length.
- **Fill rule (§5.4)** — pad-only frames (outside `[a..b]`) decode to all-black; the PNG sequence has **no
  missing index** (contiguous `%07d`).

### 12.2 Missing-mask hard-fail (Decision 2 / item 9)
- A window with a mask **missing inside `[a..b]`** that the single re-track **cannot** fill → assert the
  pipeline throws **`MASK_TRACK_GAP`**, the error **lists the exact missing frame indices**, and **no
  encode + no provider submit** occurred (assert submit call-count = 0).
- A window where the single re-track **does** fill the gap → assert it proceeds (and that re-track ran
  **at most once**).
- Assert an interior gap is **never** silently blacked (no all-black frame is emitted for an index inside
  `[a..b]`).

### 12.3 Determinism (§6.2)
- **Mandatory** — encode the same inputs twice; decode both; assert every frame pixel-identical.
- **Optional** — if the finalized recipe yields byte-identical containers, add a sha256-of-file equality
  assertion; else keep only the decoded-frame check and record why.

### 12.4 Two-mask polarity round-trip (after §11 resolves polarity)
- Encode a provider-ready mask whose decision region is a known rectangle; decode; assert the region the
  **worker hands the provider** (post-threshold/inversion per §5.3) marks the intended pixels; and
  separately assert the **soft local mask** used for compositing (§8.2) is the feathered white=edit one.
  Pins the two-mask contract so a refactor can't silently flip or merge them.

### 12.5 Routing (items 2, 3)
- With a synthetic `fal` `video.inpaint` manifest carrying probed bounds + `operations:['remove']` +
  rational fps rates: assert `manifestSatisfies` **admits** an in-bounds `remove` request and **rejects**
  (a) out-of-bounds duration/dims, (b) an fps not in the manifest's rational rates, (c) a `remove` request
  against a manifest whose `operations` lacks `remove`, (d) a `maskVideoKey`-present request against
  `supportsMask:false`. **Each new branch's test must fail-first against a stubbed filter** (§3.3).

### 12.6 Caching / retry-dedup / durable claim (items 11, 12)
- Two identical removal requests → the VOID module's `submit` is called **once**; the second serves from
  cache (assert call-count + identical `resultAssetKey`).
- A simulated crash/timeout **after a persisted `providerJobId`** → the retry **polls the existing job**,
  `submit` **not** called again, **no fall-through** to another provider, **no second cost row**.

### 12.7 Output MIME + bounded download (item 13)
- A mocked VOID `video/mp4` native output → assert the stored asset's content-type is `video/mp4` (not
  `image/png`), i.e. the threaded MIME reaches `store`.
- A mocked oversized download → assert `fetchUrl` fails closed at the byte ceiling (no unbounded buffer).

### 12.8 Adapter dispatch (Decision 1 / item 4)
- Assert one registered `fal` adapter routes an `image.inpaint` request to the image module and a
  `video.inpaint`+`remove` request to the VOID module; assert the existing image-adapter tests remain
  green (structure refactor, unchanged behavior).

### 12.9 §9.5 chunked removal (item 14)
- A window longer than one child → assert deterministic child ids/cache keys, one source+one mask per
  child, overlap blend of adjacent outputs, and that a resumed run reuses accepted child jobs without
  resubmission.

---

## 13. Revised build order (all gated, all no-spend/synthetic until the owner authorizes live inference)

1. **Type/routing changes (§3):** `sourceVideoKey`/`maskVideoKey`, `fpsNum/fpsDen`, `operation` field +
   manifest `operations[]` + rational fps rates + `manifestSatisfies` fps/operation filters. Logged §7
   deviations. Tests §12.5 (fail-first).
2. **Zero-spend probe (§11)** — **gated on explicit owner key/network approval.** Resolves every
   `[VERIFY]` cell, finalizes the §6.1 recipe and the manifest bounds. No media, no inference.
3. **Mask-video encoder + worker mask materialization (§5, §6):** the §6 wrapper recipe (finalized from
   the probe), the two-mask derivation, the black-frame helper, the missing-mask hard-fail + one-re-track
   (§5.4). Tests §12.1–§12.4.
4. **One-fal-adapter refactor + VOID module (§4):** structure refactor (image behavior unchanged) + the
   VOID removal module (fal queue transport, mocked `fetch`, no network). Tests §12.8.
5. **Routing wiring:** the `fal` `video.inpaint` manifest with probed bounds. Tests §12.5.
6. **Resolution + output handling (§7, §8):** pre-routing processing resolution, composite-back-at-native,
   provider-video validation, MIME threading, bounded download. Tests §12.7.
7. **Durable claim / cache / lineage (§9):** durable operation record, persist-jobId-after-submit,
   no-fall-through-once-accepted, cache hit/miss/dedup. Tests §12.6.
8. **§9.5 chunked removal (§10):** child windowing, deterministic child cache keys, overlap blend,
   assembly, splice. Tests §12.9.
9. **(Later, gated)** first live VOID inference; RIFE interpolation of non-key frames; bidirectional
   optical-flow interior-gap fallback (Decision 2, separate spec).

**After logging this spec: STOP for re-review.** Do not proceed to step 2 (or any step) without a fresh
explicit owner go, and step 2 additionally needs explicit key/network approval.

---

## 14. What I did / did NOT do this session

- **Did:** read the onboarding chain (README, CURRENT-STATUS, handoff-25, SESSION-PROTOCOL); read `0029`
  in full incl. its 14-item correction, `0028` §7a via the index, and `LOG-INDEX`; re-verified the
  decision-affected code seams at `52e3277` (`registry.ts`, `types.ts`, `routing.ts`,
  `execution-context.ts`) directly; claimed `0031` in the index; wrote this revised specification folding
  all 14 correction items + the owner's two decisions; kept `_IN-PROGRESS_CC-OPUS-01.md` current.
- **Did NOT:** write or change any code; add any FFmpeg string (the §6.1 recipe is deferred to the probe
  and remains uncommitted); call any provider; run the probe; read the fal key contents; upload media;
  spend anything; modify VHE-2 or the §7 `Capability` union; re-run the suite (nothing changed — remains
  **153/153 · preflight 13/4/1** from `0027`, HEAD `52e3277`).

## 15. Prevention / harvest note

Two reusable lessons for the Soren Tools Library / a revised blueprint:
1. **A control-signal video (mask/depth/matte) fed to a downstream model must be carried
   decision-preserving and fps/dim/frame-count-locked to its source** — but the *exact codec* is a
   provider-capability fact, not a default to assume (the `0029`→correction lesson: don't lock the recipe
   before the probe).
2. **Provider-native MIME must be threaded end-to-end through the storage seam** — an extensionless,
   content-type-guessing store silently mislabels non-image outputs (`s3-store.ts` defaulting to
   `image/png`). Any store's `store(bytes, hint)` that guesses type from the hint is a latent bug for
   every new output media type.

## 16. Related entries

- `VHE-ISSUE-LOG-0029` — the **first** removal-lane spec + its 14-item Eli correction. **This entry
  supersedes it for implementation**; `0029`'s filed body remains as history. Read `0029` §1/§9 for the
  unchanged background; read `0031` for what to build.
- `VHE-ISSUE-LOG-0028` §7a — the owner ruling both specs discharge (lane choice = fal VOID, existing
  `video.inpaint` cap, caching/dedup/lineage required, zero-spend probe authorized, spec-first gate).
- `VHE-ISSUE-LOG-0027` — the built content-replacement keyframe orchestration + S3 presign; the sibling
  lane this one parallels (and whose `out = frame·(1−m) + patch·m` composite §8.2 reuses).
- `VHE-ISSUE-LOG-0026` — the fal image adapter whose queue transport the VOID module reuses, and the
  fal-mask-polarity precedent (flux inpaints white).
- `VHE-ISSUE-LOG-0025` — the §9.5 deterministic chunker (`chunked-repair.ts`) the removal-window contract
  (§10) must obey.
- `VHE-ISSUE-LOG-0024` — the `ProviderExecutionContext` + versioned cost-catalog patterns the lineage
  record (§9.2) extends rather than forks.
- `VHE-ISSUE-LOG-0020` / `0021` — the still-deferred §11 "Apply"/edit-graph work the apply-time
  `inpainted_from` edge (§9.2) depends on.
- `VHE-ISSUE-LOG-0016` / `0018` — the §7-block `.docx` token-loss / logged-deviation precedent; every
  additive §7 type/manifest/storage change in §3/§8/§9 must be logged as one when built.

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

### 2026-07-24 (evening EDT) — Eli second-round review: 9 required corrections. Still NOT build-authorized.

**Signed:** `CC-SONNET-01` — Claude Sonnet 5, Claude Code Desktop (same room; model switched
Opus→Sonnet mid-session via `/model`, so this correction signs under the Sonnet identifier per
`AI-ACCOUNT-REGISTRY.md` convention — different model on the same account gets a different
identifier). **Review by:** Eli (external AI reviewer), relayed by the owner (Ashley) via chat, in
response to `VHE-Progress-update 03_2026-07-24.zip` (containing this entry). **Status change:** Eli's
verdict — "0031 successfully folds in the direction of all 14 original review points, but it is not
yet build-authorized. Six points are complete; seven remain partially specified; item 8 is still
architecturally incorrect." Nine numbered corrections follow, to be folded in as a further revision
before build authorization. **Nothing implemented or probed in producing this correction** — only the
filed §3/§4/§5/§6/§7/§8/§9/§10/§13 sections above were re-read to ground each item.

Each item states Eli's finding/instruction and the revised position that governs going forward. The
filed sections above are left intact; where an item contradicts them, **this correction governs.**

**1. Removal-request fields must be conditionally required + runtime-validated; mask-routing must
check `maskVideoKey`; rational fps must be canonicalized before comparison.**
§3.1 added `sourceVideoKey?`/`maskVideoKey?` as optional fields; §3.3 added an fps filter without
specifying comparison semantics. **Revised:** when `req.capability === 'video.inpaint'` AND
`req.operation === 'remove'`, `sourceVideoKey`, `maskVideoKey`, `fpsNum`/`fpsDen`, `durationSec`, and
the processing `width`/`height` become **required** and are runtime-validated at the request boundary
(reject with a clear validation error if any is absent for a `remove` request) — not merely optional
fields a caller might forget. §3.3/§5.1's `manifestSatisfies` mask-support check
(`req.maskKey !== undefined && !cap.supportsMask`) must be extended to **also** check `maskVideoKey`
for the video lane — as filed it only ever looks at the image-semantic `maskKey`, so a video removal
request with a mask would incorrectly bypass the mask-support filter. **Rational fps comparison must
be canonical, not raw-tuple equality:** reduce both the request's and each manifest-advertised rate to
lowest terms via GCD (or cross-multiply: `reqNum*rateDen === rateNum*reqDen`) before comparing —
naive `{num,den}` equality would incorrectly reject an equivalent rate expressed with different
factors (e.g. `60000/2002` vs `30000/1001`, the same rate).

**2. The one-fal-adapter decision stands, but capability/operation/model/handler-identity must be
persisted with every provider operation — `poll()`/`cancel()` cannot dispatch correctly from a raw
`providerJobId` alone.**
Decision 1 (§1, §4) is **unchanged** — one registered `fal` adapter, internal dispatch. But the
correction's own §9.2 durable operation record did not explicitly require persisting *which internal
handler* (image vs VOID) a given job belongs to. **Revised:** the durable operation/cache record (§9.2)
MUST persist, alongside `providerJobId`: `capability`, `operation`, the resolved `model`/endpoint, and
a **handler identity** (e.g. `'fal:image'` vs `'fal:void'`). This is what lets the single fal adapter's
internal `poll`/`cancel` dispatch correctly when resuming a job after a worker restart — without it,
a resumed poll has only a raw job ID and no way to know which internal module issued it. This is an
addition to the §9.2 record fields, not a registry change (Decision 1 stands).

**3. Replace the circular "choose processing resolution before routing" flow with two-stage routing.**
§7 as filed said: choose a provider-compatible processing resolution *before* routing, transform
source+mask to it, then route+submit at that resolution. **This is circular** — the processing
resolution depends on the target provider's `maxWidth`/`maxHeight`, which isn't known until routing
has selected a candidate; you cannot pick "the" processing resolution before you know which provider
you're routing to. **Revised — two-stage routing:**
- **Stage 1 (order/filter, dimension-independent):** rank and filter candidate connections using
  capability, `operation` (§3.4), fps (§1 above), duration, and mask-support ONLY — dimension/resolution
  is **removed from this initial filter** (it cannot be evaluated yet).
- **Stage 2 (per-candidate, inside the chain walk):** for each candidate in ranked order, derive
  **that candidate's** processing resolution (clamped to its manifest `maxWidth`/`maxHeight`),
  transform source+mask together to it (§7's transform step, unchanged in substance), then attempt
  submission to that candidate. If the candidate fails for any reason, the walk proceeds to the next
  candidate and **re-derives** a fresh processing resolution for it (never reuses the prior
  candidate's resolution).
This mirrors how §9.1's existing per-provider downscale-then-composite-back already works for images
— extend that established pattern rather than inventing a pre-routing resolution choice.

**4. Add an ambiguous-submit state — do not auto-resubmit or fall through when a submit's outcome is
unknown.**
§9.1 as filed covers two states: submit fails cleanly (no job created) and submit succeeds with a
durably-persisted `providerJobId`. It did not cover a third, real state: the POST to fal may have been
**accepted by the provider** but the response carrying the `providerJobId` never reached us (dropped
connection, timeout before the ID was read) — an outcome that is **unknown**, not failed. **Revised:**
add a durable `submission_unknown` / `awaiting_reconciliation` state. On any submit where the response
is lost/timed-out before a `providerJobId` is captured, the pipeline **must not** automatically
resubmit (risks a duplicate paid job) and **must not** fall through to another provider (the first
submission may still be live). If fal supports a client idempotency key (§11 probe item 7), send it on
every submit so a safe resubmit can use it to detect/reuse the original job. Otherwise, **stop** in
`submission_unknown` and require reconciliation (an operator/automated check against the provider's
job-listing API, or an owner-visible flag) before any further action on that cache key.

**5. Settle persistence before implementation: owner+connection-scoped operation record, split
`resultStorageKey` from the Apply-time media asset, define retention/promotion.**
§9.2's durable record used `resultAssetKey` ambiguously for both the raw cached output and (by
implication) the eventual applied asset. **Revised:**
- The durable operation/cache record is scoped by **owner AND provider-connection**, not just the
  content-hash cache key — so switching BYOK connections, or two owners whose hash inputs happen to
  coincide, never share or leak a cached result across scopes.
- Rename the cached-output field to **`resultStorageKey`** — the location of the raw repaired-video
  bytes as stored at repair time. This is explicitly **distinct** from the **media asset** created when
  the user Apply's the result (§9.2's `inpainted_from` lineage edge, still gated on the deferred §11
  edit-graph work per `0020`/`0021`). Apply-time **promotes** (or copies) the `resultStorageKey` bytes
  into a permanent media asset; the two are never the same field.
- **Retention/promotion policy:** an unapplied cached `resultStorageKey` is retained for a defined
  window (concrete duration is an owner decision, not invented here — flag as **[OPEN — owner
  decision]** at build time) and is eligible for cleanup after it expires if never applied; applying
  promotes it before any expiry sweep would remove it.

**6. Mask-encoder determinism: mandatory decision-region identity post-threshold, not unconditional
raw-pixel identity; raw-pixel identity is mandatory only when the accepted format is lossless.**
§6.2 as filed made "decode both encodes, assert every frame pixel-identical" **unconditionally
mandatory**. **Revised — this is too strict given §6.1's codec/format is still probe-deferred:**
- **MANDATORY (all cases):** after applying whatever thresholding the provider uses to read the mask
  as a binary decision, two encodes of the same input must yield the **same decision region** (same
  set of pixels treated as erase-vs-keep) — this is the real bar, and it holds even if raw sub-threshold
  pixel values differ slightly (e.g. compression noise the provider's own threshold absorbs).
- **MANDATORY, CONDITIONALLY:** full raw decoded-pixel identity (frame-for-frame) is required **only
  when the §11-probe-finalized accepted format is actually lossless**. If the accepted format is not
  strictly lossless, raw-pixel identity is not a valid requirement to hold the encoder to.
- **OPTIONAL (unchanged):** byte-identical containers remain a bonus only, either way.
This supersedes §6.2's framing; §12.3's golden test must branch on which tier applies once §11
resolves the accepted format.

**7. Provider-minimum padding: boundary-frame repetition for the source, black no-edit for the mask;
validate the full padded output first, then trim and validate the true window separately.**
§6.4 said "pad source AND mask together" without specifying source pad **content**. **Revised:**
- **Source pad frames:** boundary-frame repetition — repeat the first (or last) real frame of the true
  window into the padding, **not** black/blank content (it's real video, not a mask).
- **Mask pad frames:** all-black / no-edit, consistent with §5.4's existing pad-frame rule.
- **Validation is two-stage, not combined:** first validate the **full padded** provider output
  (dimensions/fps/frame-count/duration against the padded length actually submitted); **then**,
  separately, trim to the true `[a..b]` window and **re-validate that trimmed segment** against the
  true window's expected properties. Do not fold trim+validate into one step — each stage catches a
  different class of provider misbehavior.

**8. Remove "global key / global seed" from the §9.5 removal-window contract — VOID is seedless; a
global seed does not apply. Reuse deterministic windows / tracking-carry / accepted-child-reuse /
overlap-blend / assembly / splice only.**
§10 as filed said removal "must obey the same global-key/global-seed/window discipline the
deterministic core already enforces." **This is architecturally wrong** (Eli's flagged item): VOID is
established (0028/0029) as a **seedless** provider — determinism for a seedless provider comes from
**caching/dedup per chunk** (§9.1/§9.2's deterministic cache keys), not from propagating a shared seed
value that the provider never accepts or uses in the first place. A "global seed" is meaningless for a
lane with no seed input. **Revised:** §10's removal-window contract reuses from `chunked-repair.ts`
(`0025`) **only**: deterministic child **windows** (W=48/O=8-style), **tracking carry** (mask-tracking
continuity across chunk boundaries), **accepted-child-job reuse** (resuming without resubmission, tying
to §9.1's durable claim / item 4 above), **overlap quality gating/blending** (the SSIM-based blend of
adjacent outputs), **assembly**, and **final splice**. "Global key" and "global seed" are **removed**
from the removal-lane contract entirely — determinism is carried by the per-chunk cache key (§9.2)
alone.

**9. Reorder §13 so the zero-spend probe is the FIRST step after spec approval — before ANY
implementation, types included.**
§13 as filed listed step 1 = type/routing changes, step 2 = the zero-spend probe. **Revised:** the
gate is strictly **spec approval → explicitly authorized zero-spend probe → implementation** — with
**no** implementation step, not even "just types," preceding the probe. §13 is renumbered: the probe
(§11) is build-order step 1 (still gated on explicit owner key/network approval, unchanged); every
other step (types/routing, encoder+mask, adapter, routing wiring, resolution/output, durable
claim/cache/lineage, §9.5 chunked removal) moves to steps 2–8 in the same relative order as before,
strictly after the probe returns. This closes the gap where "the types don't need the probe, so
starting there is harmless" reasoning could erode the stop-and-wait discipline the owner has repeatedly
ruled on.

**Net:** items 1, 3, 4, 6, 7, 8 correct or reverse specific mechanisms in the filed body (request
validation + fps comparison, the circular resolution-before-routing flow, submit ambiguity, encoder
determinism tiering, padding content + two-stage validation, and the seed framing in §10 — item 8 is
the one Eli called flatly architecturally wrong); items 2 and 5 deepen already-flagged persistence
requirements without reversing anything; item 9 is a build-order/discipline fix, not a technical
reversal. **`VHE-ISSUE-LOG-0031` remains NOT build-authorized.** Next action: fold this correction into
a further-revised design (either another appended correction after re-review, or a clean successor
entry if the next reviewer prefers a full rewrite at that point) and **STOP for re-review again** — the
zero-spend probe stays gated on the owner's explicit key/network approval and now, per item 9, is
formally the first authorized step of implementation, not a mid-sequence one.
