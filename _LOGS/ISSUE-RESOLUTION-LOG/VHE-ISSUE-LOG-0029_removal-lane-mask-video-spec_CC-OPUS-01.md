# VHE-ISSUE-LOG-0029 — Additive removal-lane specification: mask-video encoder + fal VOID adapter contract

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0029 |
| **Date / time** | 2026-07-24 (morning EDT) |
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §9.2 (video repair — the removal / background-fix path) · §7 (capability routing) · §6 (FFmpeg wrapper) · §5 (mask format) · §8 (SAM-2 mask tracking) |
| **Category** | Specification (design artifact) — the gated first-build deliverable required by `VHE-ISSUE-LOG-0028` §7a ruling #5 |
| **Status** | **SPEC — written, awaiting review. NOTHING built, NOTHING probed, NO spend.** |
| **Baseline commit** | `52e3277` (unchanged; spec only, no code) |

---

## 0. Why this spec exists (and what it is NOT)

`VHE-ISSUE-LOG-0028` compared the hosted video-removal options and the owner ruled (0028 §7a):
build **fal VOID** first for object removal, under the **existing** `video.inpaint` capability, with
caching/retry-dedup/lineage, and a **strictly zero-spend** limits probe. Ruling **#5** gated all of
it behind one prerequisite:

> A **separate additive removal-lane specification** must be written and logged **first**, covering:
> per-frame PNG masks → deterministic `mask.mp4`; exact source fps/dims/frame-count/alignment;
> provider-required mask polarity and pixel format; a §6-wrapper-only implementation plan; and a
> golden-test plan. **Only after that spec is logged** may the encoder, a mock VOID adapter, routing
> tests, caching, and lineage be implemented — against no-spend/synthetic media only.

**This entry is that spec.** It is a design contract, not code. Explicitly:

- **No code was written.** HEAD is still `52e3277`; the suite/preflight are untouched (153/153 · 13/4/1,
  not re-run because nothing changed).
- **No provider was called.** No probe, no submission, no spend. The zero-spend probe (0028 ruling #4)
  is authorized but is a **separate later step** — it is *specified* here, not *executed*.
- This spec is **additive**: it does not modify VHE-2, does not touch the frozen §7 `Capability` union,
  and does not alter any existing module's behavior. Every "build item" below is a future task.

The spec is deliberately verbose. Per the logging system's purpose, a future builder (possibly a
different model/platform) must be able to implement the removal lane from this document **without
re-deriving anything and without guessing**. Where a fact is not yet verifiable it is marked
**[VERIFY — zero-spend probe]** and MUST NOT be assumed true at build time.

---

## 1. Ground truth: what is already built that this lane sits on

Read these before implementing. Line references are to `52e3277`.

### 1.1 §5 mask format — `packages/masks/masks.ts`
- `rasterizeMask(m: MaskObject, W, H): Promise<Buffer>` returns a **PNG**, **white (255) = edit region**
  on a **black (0)** background, optionally **feathered** (`featherPx`, Gaussian blur, sigma ≈
  feather/2). Output is greyscale then PNG-encoded.
- `MaskObject` carries `keyFrame` (the frame the user drew on) and `frameRange {start,end}` (nullable),
  plus `mode: 'add'|'subtract'`, `featherPx`, `tracked`.
- **Consequence for this lane:** the per-frame mask source of truth is already this rasterizer. The
  removal lane does NOT invent a new mask raster; it calls `rasterizeMask` once per frame in the window
  (mask supplied per-frame by the §8 tracker or a static key-frame mask, exactly as
  `keyframe-repair.ts` already injects `maskFor(absoluteFrame)`).

### 1.2 §6 FFmpeg wrapper — `packages/media/ffmpeg.ts`
- **THE ONLY PLACE FFMPEG STRINGS EXIST** (§0 rule 3). Every recipe is a typed arg-builder; the
  vendored 7.1.1 binary is hard-pinned (`assertVendored`), the forbidden system 8.1.2 can never run.
- `encodeMidArgs(framesPattern, firstMidFrame, num, den, outMp4)` — the existing numbered-PNG → mp4
  recipe (§6.4 Step 3):
  ```
  -y -framerate num/den -start_number <first> -i <pattern>
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p <out.mp4>
  ```
  **This recipe is LOSSY (`-crf 18`) and chroma-subsampled (`yuv420p`).** It is correct for *repaired
  content frames* (photographic) but **WRONG for a binary mask video** — see §3.1. The removal lane
  therefore needs a **new, separate** wrapper recipe; it must NOT reuse `encodeMidArgs` for the mask,
  and it must NOT improvise an ffmpeg string outside this file (0028 ruling #5).
- `extractFrameRangeArgs(input, A, B, num, den, outDir)` — extracts source frames as
  `<outDir>/%07d.png`, numbered by **absolute** frame index via `-start_number A`. This is how the
  source window PNGs are already numbered; the mask PNGs must use the **same** numbering to stay aligned.
- fps is always a rational `num/den`; **floating-point fps never appears** (§0).

### 1.3 §7 routing/types — `packages/providers/{types.ts,routing.ts}`
- `Capability` union **already contains `'video.inpaint'`** (types.ts:23). **No enum edit is needed or
  permitted** (0028 ruling #2).
- `GenRequest` already carries everything the removal lane needs: `capability`, `maskKey`,
  `durationSec`, `fps`, `width`, `height`, `seed?`, `sourceImageKey?`, and a free-form
  `extra?: Record<string, unknown>`. **No `GenRequest` field needs to be added** — the removal operation
  is signalled via `extra.operation = "remove"` (0028 ruling #2).
- `manifestSatisfies(conn, req)` (routing.ts:41) already filters on: capability present, `width/height`
  ≤ `maxWidth/maxHeight`, `durationSec` within `min/maxDurationSec`, and `supportsMask` when `maskKey`
  is present. **A `video.inpaint` manifest slots into routing with ZERO routing-code change.**
- `CapabilityManifest.capabilities['video.inpaint']` supports `fps[]`, `minDurationSec`,
  `maxDurationSec`, `maxWidth/Height`, `supportsMask`, `supportsSeed`, `costHintCentsPerOp` — the fields
  a video manifest needs are already defined.

### 1.4 fal queue transport — `packages/providers/adapters/fal-image.ts`
- The existing fal image adapter already speaks fal's queue API: `submit` (POST `{base}/{model}`) →
  `poll` (GET `{model}/requests/{id}/status` → `{model}/requests/{id}`), `Authorization: Key <FAL_KEY>`,
  URL-in via `ctx.signInputUrl(key,{ttlSec})`, URL-out normalized by the registry's
  `normalizeToAssetKeys` → `store.fetchUrl`.
- A VOID **video** adapter is *this transport with a different `modelId` and request body*: it signs a
  **source-video** URL and a **mask-video** URL instead of two images, and returns a **video** URL. The
  submit/poll/cancel/error-mapping (`mapHttp`) logic transfers directly.
- **Polarity note carried from the image adapter:** fal *flux image* inpainting inpaints the **WHITE**
  region and our §5 mask is already white=edit, so the image adapter needs no inversion. **Whether fal
  VOID uses the same polarity for its mask VIDEO is NOT known** and is the #1 probe item (§4).

### 1.5 The sibling lane — `packages/repair/{video-repair.ts,keyframe-repair.ts}`
- The **content-replacement** lane (built, 0027) inpaints keyframes as still images + composites under
  the mask + (deferred) RIFE-interpolates. It returns **N keyframe patches**.
- The **removal** lane is a *different output contract*: it submits the whole window + a mask video and
  gets back **one repaired video** ("route there, skip local work", §9.2). It **bypasses** the
  keyframe/RIFE/`compositeUnderMask`/`validateKeyframePatchOutputs` back half entirely. The two lanes
  share the front (extraction, §5 mask raster) and the provider transport, not the back.

---

## 2. Scope of the removal lane (what gets built, in order — all future)

Build order, each gated on the previous, all against **no-spend/synthetic media only** until the owner
authorizes live inference:

1. **Mask-video encoder** — a new §6-wrapper recipe (§3) + a thin `packages/repair/` orchestration that
   rasterizes per-frame §5 masks over the window and drives the recipe. (This spec's primary subject.)
2. **Zero-spend VOID limits/polarity probe** (§4) — resolves every **[VERIFY]** cell. No media, no
   inference.
3. **Mock VOID adapter** — the fal-queue transport (§1.4) shaped for VOID's real request/response schema
   (as learned from the probe), tested with a mocked `fetch` (no network), returning a native video URL
   output.
4. **Routing wiring** — a `video.inpaint` manifest for the `fal` connection; verify `manifestSatisfies`
   admits/rejects correctly on dims/duration/fps/mask. Zero routing-code change expected (§1.3).
5. **Caching / retry-dedup / lineage** (§5) — the new cross-cutting requirement from 0028 ruling #3.
6. **Golden tests** (§6) for every deterministic piece.

This entry fully specifies **#1, the contracts for #3–#5, and the plans for #2 and #6.** It builds none
of them.

---

## 3. Mask-video encoder specification (ruling #5 items 1 & 2)

### 3.1 Why `encodeMidArgs` cannot be reused for the mask

A removal provider uses the mask to decide **which pixels to erase**. The mask must therefore stay a
**crisp, unambiguous** signal. `encodeMidArgs`'s `-crf 18` **lossy** x264 will:

- **soften the mask boundary** — lossy DCT ringing turns a hard 0/255 edge into a gradient of
  intermediate values, so the provider's "is this pixel masked?" threshold lands in a fuzzy band and the
  removal region drifts by a few pixels frame-to-frame (exactly the temporal wobble removal is supposed
  to avoid); and
- with `yuv420p`, **chroma is subsampled 2×2** — harmless for a pure-luma grey mask in principle, but
  combined with lossy luma it compounds edge softening.

Even a *feathered* §5 mask (which is intentionally soft for our *compositing*) is a problem here: the
provider wants a **decision mask**, and lossy re-encoding of an already-soft edge makes the effective
cut line non-deterministic. **The mask video must be encoded losslessly**, and the feather question is a
polarity/format decision for the provider (§4), not something the codec should smear.

### 3.2 The new wrapper recipe (to be ADDED to `packages/media/ffmpeg.ts`)

A new typed arg-builder — proposed name `encodeMaskVideoArgs` — added to the §6 wrapper (the ONLY legal
home for the string, 0028 ruling #5). **Proposed** shape, to be finalized against the §4 probe:

```
-y -framerate <num>/<den> -start_number <firstAbsFrame> -i <maskPngPattern>
-an -c:v libx264 -qp 0 -preset veryslow -pix_fmt gray -threads 1 <out.mp4>
```

Rationale for each divergence from `encodeMidArgs`, all **[VERIFY — probe/decode test]** before locking:

| Setting | Value | Reason |
|---|---|---|
| `-qp 0` (or `-crf 0`) | **lossless** | binary mask must survive the codec bit-exact (§3.1). `-qp 0` is true lossless x264. |
| `-pix_fmt gray` | luma-only | the mask has no color; `gray` avoids chroma entirely. **[VERIFY]** VOID may require `yuv420p`/RGB — if so, use lossless `yuv444p`/`yuv420p` (no subsampling loss at qp 0) instead, decided by the probe. |
| `-threads 1` | deterministic | multi-threaded x264 can reorder slice decisions → non-byte-identical output across runs/machines. Single-threaded lossless is the safe determinism choice for the golden test (§6). **[VERIFY]** — if too slow, the golden test compares **decoded frames** rather than container bytes (§6.2). |
| `-an` | no audio | a mask has no audio; prevents a dummy track. |
| `-preset veryslow` | — | at `-qp 0` preset affects size/speed only, not the (lossless) pixels; a fixed preset keeps output stable. |
| `-framerate num/den` | rational | MUST equal the source window fps exactly (§3.3). Never a float (§0). |
| `-start_number firstAbsFrame` | absolute | mask PNGs are numbered by absolute frame like `extractFrameRangeArgs`; keeps mask frame N ↔ source frame N (§3.3). |

**This table is a proposal for review, not a locked recipe.** The probe (§4) may force `yuv420p`/RGB or
a container other than mp4 (e.g. VOID may want a specific pixel format or an alpha-encoded "quad" mask).
The finalized recipe is chosen only after §4, and it lives in `ffmpeg.ts` and nowhere else.

### 3.3 Exact source-alignment contract (ruling #5 item 2)

The mask video is a **frame-exact twin** of the extracted source window. All four must match:

1. **fps** — identical rational `num/den` to the source (from §3 ingest / probe). Carried as
   `num`/`den`; float fps is forbidden (§0). A mismatch shifts the mask off the frames it masks.
2. **dimensions** — the mask video is `W×H` = the **native asset resolution** the §5 mask is rasterized
   against (same `assetWidth`/`assetHeight` the keyframe lane already uses). If the provider downscales
   internally, the source and mask must be downscaled **together** by the adapter, never the mask alone.
3. **frame count** — exactly the padded window length. Define the window as §9.2's
   `paddedExtractionRange` (`[a−pad .. b+pad]`, clamped to clip bounds), the **same** window the
   content-replacement lane extracts (`video-repair.ts`). Frame count = `padded.end − padded.start + 1`.
4. **frame alignment** — mask frame at absolute index `f` corresponds to source frame `f`. Enforced by
   numbering mask PNGs `%07d.png` with `-start_number = padded.start`, identical to
   `extractFrameRangeArgs`.

**Fill rule for every frame in the window (MUST be explicit — no gaps):** for each absolute frame `f` in
`[padded.start .. padded.end]`, the mask PNG is:
- `rasterizeMask(maskFor(f), W, H)` when `f` has a tracked/drawn mask; and
- an **all-black** (no-edit) frame of size `W×H` for frames in the temporal pad that fall **outside**
  `[a..b]`, or for interior frames the tracker did not cover. There is **never** a missing frame in the
  sequence — the encoder requires a contiguous `%07d.png` run, and a missing index would truncate or
  misalign the mask video. Producing the all-black filler reuses `rasterizeMask` with an empty/again-black
  shape or a direct `sharp`-generated black PNG at `W×H` (a §5-consistent helper, not a new ffmpeg
  string).

### 3.4 Determinism of the mask video (ruling #3 support)

Given identical inputs — the same per-frame PNG bytes, the same `num/den`, the same window, the same
vendored ffmpeg 7.1.1, and the fixed lossless single-threaded recipe — the mask.mp4 must be
**reproducible**. Two determinism tiers, chosen in §6.2:

- **Tier A (strongest):** byte-identical container across runs (feasible with `-qp 0 -threads 1` and a
  fixed preset, but mp4 mux can embed nondeterministic metadata — e.g. encoder tags; may need
  `-fflags +bitexact`/`-flags +bitexact`, **[VERIFY — decode test]**).
- **Tier B (fallback):** **decoded-frame** identity — decode both mask videos to PNG and assert every
  frame is pixel-identical. Immune to container-metadata jitter. This is the **required** guarantee; Tier
  A is a bonus if achievable.

The mask **hash** recorded in lineage (§5) is the hash of the canonical artifact under whichever tier is
adopted (prefer hashing the **decoded frame sequence** or the raster inputs, so the lineage hash is
stable even if the container is not).

---

## 4. Provider polarity & pixel-format — the zero-spend probe plan (ruling #5 item 3, ruling #4)

These are the facts that CANNOT be assumed and that the **strictly zero-spend** probe (0028 ruling #4)
must resolve **before any mask.mp4 is ever submitted**. The probe reads schema/metadata ONLY — no media
upload, no enqueue, no inference, nothing that can bill. **If any endpoint's cost behavior is uncertain,
STOP and ask the owner** (0028 ruling #4, verbatim intent).

**[VERIFY — zero-spend probe] items:**

1. **Mask polarity** — does VOID remove the **white** region or the **black** region of the mask video?
   (fal *flux image* removes white; VOID's "quad mask" is a different model and may differ.) Our §5 mask
   is white=edit; if VOID wants black=edit the adapter inverts, exactly as the OpenAI image adapter
   already inverts. This determines whether the encoder emits white-on-black or the adapter inverts.
2. **Mask pixel format / channels** — greyscale? RGB? A 4-channel "quad" mask (the fal page literally
   says "quad mask video url")? Alpha-encoded? This decides `-pix_fmt` in §3.2 and whether the mask is
   one channel or packed.
3. **Mask as hard-binary vs soft** — does VOID want a thresholded 0/255 mask, or does it accept/prefer a
   feathered edge? (Drives whether the encoder thresholds the §5 feather away.)
4. **Duration / resolution / fps bounds** — VOID's limits were unpublished in 0028 (all **[verify
   live]**). The probe fills `minDurationSec`/`maxDurationSec`/`maxWidth`/`maxHeight`/`fps[]` in the
   `video.inpaint` manifest with HONEST values; until then the manifest must not state invented bounds
   (§0 no-assumptions).
5. **Seed / determinism surface** — VOID exposed no seed in 0028. Confirm. (Ruling #3 already accepts a
   seedless provider *as long as the pipeline* caches/dedups/records lineage — §5.)
6. **Exact request/response schema** — field names for the source-video URL, mask-video URL, any
   Pass2/SAM3 add-on flags, and the output video URL shape — so the mock adapter (build #3) mirrors the
   real contract.

**Until the probe resolves #1–#3, no mask video may be submitted to VOID** — a wrong polarity/format
would either waste the owner's first real spend or, worse, silently mask the wrong region.

---

## 5. Capability mapping, caching, retry-dedup & lineage (rulings #2 and #3)

### 5.1 Capability mapping (ruling #2 — settled, restated for the builder)
- Register VOID under the **existing** `video.inpaint` capability. **Do NOT** add a `video.removal` enum
  or touch the frozen §7 union.
- Distinguish the operation with **`GenRequest.extra.operation = "remove"`** (field already exists). The
  §9.2 instruction-type classifier — not the capability enum — decides removal-vs-replacement.
- The mask-video asset is referenced through the existing **`GenRequest.maskKey`** (for `video.inpaint`
  it points at the mask **video** asset; for `image.inpaint` it points at a mask **image** — same field,
  capability-dependent meaning; document this at the adapter boundary).

### 5.2 Caching / retry-dedup / lineage (ruling #3 — NEW cross-cutting requirement)

0028 ruling #3: a seedless provider is acceptable **only** if the *pipeline* is deterministic — the
returned artifact is cached and reused, retries never silently re-call the provider, and full lineage is
recorded. **No existing module has a lineage record shape yet** (flagged in 0028). This spec defines the
shape so the builder does not invent one ad hoc:

**Removal-job lineage record (proposed fields):**

| Field | Source | Purpose |
|---|---|---|
| `model` + `modelVersion` | adapter (`fal-ai/void-…` + resolved version) | reproducibility; provider drift detection |
| `sourceVideoHash` | sha256 of the extracted source-window video (reuse §3 ingest hashing) | cache key input; provenance |
| `maskVideoHash` | sha256 of the canonical mask artifact (§3.4) | cache key input; polarity/format provenance |
| `requestParams` | the normalized `GenRequest` (capability, `extra.operation`, dims, fps, durationSec, any Pass2/SAM3 flags) | cache key input; audit |
| `providerJobId` | fal `request_id` | retry-dedup: an existing job id is polled, never re-submitted |
| `resultAssetKey` | the stored repaired-video asset | the cached artifact returned on any replay |
| `costCents` + `costProvenance` | cost-catalog/dashboard (fal returns no exact cost, 0026) | budget accounting |
| `createdAt` | — | ordering |

**Cache key** = a stable hash of `{model, modelVersion, sourceVideoHash, maskVideoHash, requestParams}`.
Behavior:
- **cache hit** → return `resultAssetKey` with **zero** provider calls and **zero** spend.
- **in-flight/known job** → poll the recorded `providerJobId`; **never** submit a second job for the same
  cache key (this is the retry-dedup ruling #3 demands — a §4 retry must not double-bill).
- **cache miss** → submit once, record the full lineage row, then serve from cache thereafter.

This record shape reuses the versioned-context / cost-catalog patterns already established in 0024
(`ProviderExecutionContext`, cost-catalog provenance) rather than introducing a parallel mechanism —
the builder should extend those, not fork them. **Where this record physically lives** (a new table vs.
an extension of the job row) is an implementation decision to be raised at build #5, not pre-decided
here; the *fields and behavior* above are the contract.

---

## 6. Golden-test plan (ruling #5 item 5)

All tests use **synthetic** masks/frames (no real fixtures, no spend), run under the existing Vitest
setup, and go through the §6 wrapper (vendored 7.1.1). No network.

### 6.1 Encoder correctness
- **Alignment** — build a synthetic window `[a..b]` with a known moving white square per frame; encode
  the mask video; decode it back to PNGs; assert decoded frame at absolute `f` equals `rasterizeMask(
  maskFor(f))` for every `f` in `[padded.start..padded.end]` (IoU = 1.0 under lossless).
- **fps/dims/frame-count** — probe the produced mask.mp4 (via the §6 `probe`) and assert `r_frame_rate`
  = the source `num/den` exactly, `width/height` = `W×H`, and `nb_read_frames` = window length.
- **Fill rule** — assert pad-only frames (in the window but outside `[a..b]`, or tracker-uncovered
  interior frames) decode to all-black, and that the PNG sequence has **no missing index** (contiguous
  `%07d`).

### 6.2 Determinism
- **Tier B (required)** — encode the same inputs twice; decode both; assert every frame is
  pixel-identical.
- **Tier A (bonus)** — if `-qp 0 -threads 1` (+ any `bitexact` flag the §4 decode test proves necessary)
  yields byte-identical containers, add a sha256-of-file equality assertion; if container metadata proves
  non-deterministic, keep only Tier B and record why (§3.4).

### 6.3 Polarity round-trip (after §4 resolves polarity)
- Encode a mask whose white region is a known rectangle; decode; assert the region that the **adapter
  hands the provider** (post-inversion if §4 says VOID wants black=edit) marks the intended pixels. This
  pins the encoder↔adapter polarity contract so a future refactor can't silently flip it (the failure the
  OpenAI-inversion history warns about).

### 6.4 Routing (build #4)
- With a synthetic `fal` `video.inpaint` manifest carrying the probed bounds, assert `manifestSatisfies`
  admits an in-bounds removal request and rejects out-of-bounds duration/dims/fps and a `maskKey`-present
  request against a `supportsMask:false` manifest. Expect **zero** routing-code change (pure data/test).

### 6.5 Caching / retry-dedup (build #5)
- Two identical removal requests → the mock adapter's `submit` is called **once**; the second serves from
  cache (assert call-count and identical `resultAssetKey`).
- A simulated §4 retry after a recorded `providerJobId` → `poll` the existing job, `submit` **not**
  called again (assert no second submit, no second cost row).

---

## 7. What I did / did NOT do this session

- **Did:** read the built seam (`ffmpeg.ts` §6, `masks.ts` §5, `video-repair.ts`, `keyframe-repair.ts`,
  `types.ts`/`routing.ts` §7, `fal-image.ts`) at `52e3277`; wrote this specification; claimed and indexed
  `0029`; kept the `_IN-PROGRESS_CC-OPUS-01.md` checkpoint current throughout.
- **Did NOT:** write or change any code; add any FFmpeg string (the `encodeMaskVideoArgs` recipe in §3.2
  is a **proposal for review**, not committed to `ffmpeg.ts`); call any provider; run the probe; upload
  media; spend anything; modify VHE-2 or the §7 union; re-run the suite (nothing changed — it remains
  **153/153 · preflight 13/4/1** from 0027).

## 8. Prevention / harvest note

The reusable lesson: **the content-frame encoder (`encodeMidArgs`, lossy `yuv420p`) and a mask/control
encoder are different tools** — a control signal (mask, depth, matte) fed to a downstream model must be
carried losslessly or its decision boundary drifts. Worth generalizing into the Soren Tools Library as a
"control-signal video must be lossless + fps/dim/frame-count-locked to its source" rule, and into a §6
wrapper convention (a dedicated lossless recipe for any non-photographic frame sequence).

## 9. Related entries

- `VHE-ISSUE-LOG-0028` — the removal-lane provider comparison **and the owner ruling (§7a)** this spec
  discharges. Ruling #5 required this document; rulings #2/#3/#4 are specified in §4/§5 here.
- `VHE-ISSUE-LOG-0027` — the built **content-replacement** keyframe orchestration + S3 presign; the
  sibling lane this one parallels (and the S3 store that makes inputs fetchable by fal).
- `VHE-ISSUE-LOG-0026` — the fal image adapter whose **queue transport** the VOID video adapter reuses,
  and the fal-mask-polarity precedent (flux inpaints white).
- `VHE-ISSUE-LOG-0024` — the `ProviderExecutionContext` + versioned cost-catalog patterns the lineage
  record (§5.2) must extend rather than fork.
- `VHE-ISSUE-LOG-0013` / `0016` — prior §6/§5 `.docx` token-loss corrections; any verbatim recipe added
  to `ffmpeg.ts` must be checked against the original `.docx`, not the lossy mirror.
- `VHE-ISSUE-LOG-0009` / `0011` — the four undelivered §1 fixtures; the removal lane's **real-quality**
  gate stays blocked on them (this spec's tests are synthetic by design).

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

### 2026-07-24 (afternoon EDT) — Eli source-audit review: 14 required revisions. Spec NOT ready for implementation.

**Signed:** `CC-OPUS-01` — Claude Opus 4.8, Claude Code Desktop. **Review by:** Eli (external AI
reviewer), relayed by the owner via chat. **Status change:** the filed §0 status ("SPEC — awaiting
review") is superseded — this spec is **NOT ready for implementation** until the items below are folded
into a revised design and re-reviewed. **The owner's direct ruling stands: (1) revise the spec first and
stop for review; (2) run ONLY the zero-spend schema/metadata probe second, and only after the owner
explicitly approves key/network use; (3) build the encoder third. No implementation or provider action
is authorized.** Nothing was implemented or probed in producing this correction — I only re-read the
built code to verify each finding.

Each item states the finding, whether I **confirmed it against the code at `52e3277`**, and the revised
spec position that will carry into the reworked design. The filed sections above are left intact; where
an item contradicts them, **this correction governs.**

**1. `GenRequest` has no typed video source — do not overload `sourceImageKey`.**
CONFIRMED (`types.ts:41–55`: `GenRequest` has `sourceImageKey?`/`maskKey?`, both image-semantic; no
video field). §1.3/§5.1 above leaned on reusing these for video — wrong. **Revised:** add explicit,
typed video-input fields — `sourceVideoKey` and a distinct mask-video field (see item 5) — or a
validated `videoInput` object, rather than overloading the image keys. This is an additive change to the
verbatim §7 `GenRequest` block and MUST be logged as a §7 type deviation (0016/0018 class) when made.

**2. `manifestSatisfies()` never checks fps, and `GenRequest.fps` can't represent rational rates.**
CONFIRMED (`routing.ts:41–52` filters capability/dims/duration/`supportsMask` only — no fps branch,
even though `CapabilityManifest…fps?: number[]` exists; `GenRequest.fps?: number` is a float, cannot
hold 30000/1001). The §6.4 golden test I proposed ("rejects out-of-bounds … fps") would fail today
because the filter doesn't exist. This also contradicts §0's "float fps never appears in code."
**Revised:** define **rational** video fps on both sides — request carries `fpsNum`/`fpsDen` (not a
float `fps`), the manifest advertises accepted rational rates — and extend `manifestSatisfies` to filter
on them. The golden test is rewritten against the new filter (and must fail-first on a stubbed filter to
prove it bites).

**3. `extra.operation="remove"` does not make a provider removal-capable.**
CONFIRMED (`routing.ts` reads none of `req.extra`; the manifest has no operation metadata). §5.1's
claim of "zero routing change" is **wrong**. **Revised:** keep the `video.inpaint` enum (ruling #2
unchanged), but add **validated supported-operation metadata** to the capability manifest (e.g.
`operations: ('remove'|'replace')[]`), carry the requested operation as a **validated request field**
(not free-form `extra`), and **filter on it in `manifestSatisfies`**. So: a manifest change AND a routing
change — not zero.

**4. The adapter registry is keyed by slug alone — a second `fal` adapter overwrites the image one.**
CONFIRMED (`registry.ts:35` `adapters = new Map<string, ProviderAdapter>()`; `registerAdapter` does
`adapters.set(adapter.slug, …)`; `runGeneration` resolves `getAdapter(conn.providerSlug)` — one adapter
per slug). Registering a `slug:'fal'` VOID adapter would clobber `fal-image`. **Revised — pick one,
flagged for owner decision:** (a) ONE multi-capability fal adapter that dispatches on `req.capability`
(image.inpaint vs video.inpaint) and by model; or (b) a registry keyed by `slug+capability` (or
`slug+model`). Option (a) needs no registry change but a bigger adapter; (b) is a §7 registry change.
Spec will present both; owner chooses before build.

**5. The execution context can only read/sign existing inputs — it can't build a provider-ready mask.**
CONFIRMED (`execution-context.ts:55–61`: `ProviderExecutionContext` exposes only `readInput` +
`signInputUrl`; `store.store()` — the persist side — is deliberately withheld from adapters). §4's "the
adapter inverts" is not implementable there. **Revised:** keep canonical internal masks **white=edit**;
the **worker/pipeline** (not the adapter) materializes the exact provider-ready polarity/format mask
artifact BEFORE submission, stores it, and passes its key in the request. **Record hashes for BOTH** the
canonical mask and the provider-ready mask (feeds the lineage record, item 12).

**6. Do not lock codec/container/pixel format until the probe establishes accepted input formats.**
Acknowledged. (Clarification: §3.2 proposed **libx264 `-qp 0 -pix_fmt gray`**, not FFV1 — but Eli's
governing point stands.) `mask.mp4` presupposing x264-in-mp4 is itself an unproven assumption; a truly
lossless intra codec like FFV1 needs a container the provider decodes (MKV, not mp4), and `qp` is an
x264 knob, not an FFV1 one. **Revised:** §3.2's recipe is **non-binding** and the codec/container/pixel
format are **deferred to the zero-spend probe** (item = §4's [VERIFY] set). **Decoded-frame identity is
MANDATORY; byte-identical containers are OPTIONAL** (supersedes §3.4's Tier A/B framing — Tier B is the
requirement, Tier A a bonus only).

**7. Mask duration must equal the submitted source-window duration; add a provider-minimum policy.**
Acknowledged (§3.3 locked mask frame-count to the padded window, but never addressed a provider
**minimum** duration — 0028 flagged Wan VACE's 81-frame floor; VOID's floor is unknown). **Revised:** the
mask video duration equals the submitted source-window duration exactly; when the window is below the
provider's minimum, **pad source AND mask together** up to the minimum, then **trim the repaired output
back** to the true window before splice. No fixed/one-second mask.

**8. Native-resolution requests get rejected by routing before an adapter could downscale.**
CONFIRMED (`routing.ts:44` rejects `req.width/height > cap.maxWidth/Height` at filter time). §3.3's "if
the provider downscales internally, source+mask together" happens too late — routing already dropped the
connection. **Revised:** choose a **provider-compatible processing resolution BEFORE routing**, transform
source AND mask together through §6 to that resolution, run the removal, then **composite the result back
at native resolution** (item 10).

**9. A missing tracked mask INSIDE `[a..b]` must fail (or use an approved fallback) — never silent black.**
CONFIRMED as a real hazard (§3.3's fill rule folded "pad frames OR tracker-uncovered interior frames"
into the same all-black case; and `MaskObject` requires `shapes.min(1)`, so "empty MaskObject" would
violate the §5 schema). Silent black inside the edit range lets the removed object **flash back** on
uncovered frames. **Revised:** all-black is correct ONLY for temporal-pad frames outside `[a..b]`; a
missing mask **inside** `[a..b]` is a **hard fail before provider submission** (or an explicitly
owner-approved fallback such as hold-last/interpolated track). The black filler is produced by a
**dedicated black-frame helper** (direct `sharp` black PNG at W×H), never a schema-violating empty
`MaskObject`.

**10. Do not trust the provider video outside the mask — validate, then composite only masked pixels.**
Acknowledged — this **reverses §1.5's "bypasses the compositing back half."** A removal provider can
alter unmasked pixels; we must not ship its frame wholesale. **Revised:** validate the returned video
(width, height, **rational** fps, frame count, duration), decode it, and **composite ONLY the repaired
(masked) pixels beneath the feathered LOCAL blend masks over the ORIGINAL frames**, then rebuild + splice
(the same §9.2 `out = frame·(1−m) + patch·m` discipline the content-replacement lane already uses). **Two
distinct masks are maintained:** the **hard provider decision mask** (sent to VOID) and the **soft local
feathered blend mask** (used for our composite). They are not the same artifact.

**11. In-memory `providerJobId` doesn't survive a worker crash → risk of double-paid submissions.**
CONFIRMED (`registry.ts:169–173`: `submit` → `pollToTerminal` holds `providerJobId` only in a local
var; `walkChain` falls through to the next provider on any thrown error, including `PROVIDER_TIMEOUT`).
A crash/timeout after submit but before completion can resubmit or fall through while the first PAID job
is still live. **Revised:** a **durable provider-operation/cache claim** keyed by a unique cache key;
**persist `providerJobId` immediately after submit, before polling**; once a provider has accepted a job,
retries **resume polling that job** and **never resubmit or auto-fall-through**. The zero-spend probe
must also check whether **fal supports a client idempotency key**.

**12. Settle cache + lineage persistence before implementation.**
Acknowledged — deepens §5.2. **Revised:** a **durable operation/cache record** holds: state, provider
request id, **model + schema/version revision**, the canonical-mask + provider-ready-mask + source
hashes, canonical request parameters, cost provenance, and result key. The **media asset and the
`inpainted_from` lineage edge are created when the user APPLIES the result** (not at repair time) — which
intersects the still-deferred §11 "Apply"/edit-graph work (0020/0021); flagged as a dependency.

**13. Extensionless provider outputs default to `image/png` — a VOID video would be mis-typed.**
CONFIRMED precisely (`s3-store.ts:192` `guessContentType` returns `image/png` unless the *hint* contains
`.mp4`/`.jpeg`; `normalizeToAssetKeys` (`execution-context.ts:186`) passes hint `"<slug>-output-<hash>"`
with **no extension** and never threads `ProviderNativeOutput.mimeType` into `store.store()`, whose
signature `store(bytes, hint)` has **no mime parameter**). A VOID `video/mp4` result stores as
`image/png`. **Revised:** extend the storage seam so the **native output MIME is preserved** end-to-end
(thread `mimeType` from `ProviderNativeOutput` → `normalizeToAssetKeys` → `store.store`), and add a
**bounded/streaming download policy** for `fetchUrl` (provider videos are large — no unbounded buffering).

**14. Add the §9.5 removal-window contract.**
Acknowledged — the filed spec treated removal as a single window and never integrated the §9.5 chunking
(built in `chunked-repair.ts`, 0025: W=48/O=8, global keys/seed, deterministic child ids, restart
selection, overlap blend). **Revised:** add a §9.5 removal-window contract — **one source video + one
mask video per child window**, deterministic child cache keys (so a resumed run reuses accepted child
jobs without resubmission — ties to item 11), overlap blending of adjacent child outputs, output
assembly, and the final splice. Removal must obey the same global-key/global-seed/window discipline the
deterministic core already enforces.

**Net:** items 1–3 and 6–10 correct or reverse specific claims in the filed body (esp. §1.3 "zero
routing change", §1.5 "bypasses compositing", §3.2 locked recipe, §3.3 fill rule); items 4–5, 11–13 are
confirmed built-code constraints the reworked design must satisfy; item 14 adds required scope. **Next
action per the owner's ruling: produce the revised specification (a new spec revision / successor entry
folding all 14 in) and STOP for re-review before any probe or build.** The zero-spend probe remains
gated on explicit owner approval of key/network use; if metadata alone cannot prove polarity or accepted
decoder format, stop and report that a separately-approved minimum inference test would be required.
