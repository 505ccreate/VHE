# VHE-ISSUE-LOG-0026 — Real fal.ai `image.inpaint` adapter (first async + first URL-in/URL-out provider)

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0026 |
| **Date / time** | 2026-07-23 06:31–06:50 EDT |
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §7 (provider adapters/routing) · §9.1 (image inpaint) · VHE-3 (hosted fal adapter) |
| **Category** | Build (owner-authorized) + flagged open decisions |
| **Status** | **RESOLVED** (adapter build + green) · live fal validation OPEN (owner gate + prereqs) |

---

## 1. What happened

The owner returned this session with the fal.ai key now provisioned in the central library
(`...Soren-Tools-Library-V1 - TRANSFER 2026-07-17\Api key.txt`, location verified in the prior
handoff; contents never read/echoed here) and authorized wiring the fal adapter. Two explicit
owner instructions this session:

- **Proceed with the fal adapter now** that the key exists.
- **Do NOT generate stand-in/synthetic §1 fixtures.** The real-quality gate needs the frozen
  owner-provided examples; synthetic replacements would only re-prove plumbing and muddy the
  quality record. The four §1 fixtures remain owed; the quality gate stays OPEN.

fal is slug `'fal'` and is FIRST in `VISUAL_FALLBACK_ORDER` (routing.ts, VHE-ISSUE-LOG-0018), but
it had been reference-only because no key existed (noted in 0022). This entry makes fal a real,
registered, unit-tested adapter for the one repair capability actually built today (`image.inpaint`,
§9.1 — validated end-to-end via OpenAI in 0022).

## 2. Why it matters

fal is the owner's **primary** visual provider (head of the fallback order). Until now the router
had no adapter for it, so it could never actually win a job. It is also the first adapter that
exercises two seams the Eli-Q2a refactor (0024) built but nothing had used yet:

- **Async queue** — openai/gemini are synchronous (`submit` returns `immediate`). fal uses a
  submit→poll-status→fetch-result queue, so it is the first adapter to drive the registry's `poll`
  → `pollToTerminal` path with real logic.
- **URL-in / URL-out** — fal fetches inputs by URL and returns outputs as URLs. It is the first
  real consumer of `ctx.signInputUrl` (input side) and of the `{ kind:'url' }` provider-native
  output → `normalizeToAssetKeys`/`store.fetchUrl` download (output side).

## 3. Attempted solutions / design decisions worth recording

1. **Image, not video.** The blueprint names "a fal.ai adapter" for SAM2/ProPainter/RIFE/ESRGAN
   equivalents but the only real repair path built + validated today is §9.1 `image.inpaint`
   (OpenAI/Gemini). Built the fal **image.inpaint** adapter to parallel those exactly; provider
   `video.inpaint` stays OUT/deferred (0024: GPU/hosted video pieces are environment-blocked).
2. **Transport verified, not assumed.** The fal queue HTTP contract was confirmed against fal's
   own docs (https://fal.ai/docs/model-endpoints/queue, fetched 2026-07-23):
   submit `POST {base}/{modelId}` → `{ request_id, status_url, ... }`; status
   `GET {base}/{modelId}/requests/{id}/status` → `{ status: IN_QUEUE|IN_PROGRESS|COMPLETED }`;
   result `GET {base}/{modelId}/requests/{id}`; auth header `Authorization: Key <FAL_KEY>`;
   cancel `PUT .../cancel`. `base` defaults to `https://queue.fal.run`.
3. **Model id + per-model schema = OPEN DECISION, not a silent choice.** No blueprint specifies a
   fal model. Per the non-negotiables (no assumptions), the model is `opts.model`-configurable and
   the default (`fal-ai/flux-general/inpainting`) + the request-body field names (`image_url`,
   `mask_url`, `prompt`, `num_images`, `seed`) follow fal's standard flux-inpainting schema and are
   **flagged in the file header + here for owner confirmation before any live spend**. This mirrors
   how 0022 handled `gpt-image-1` (documented default, one-line override) — a reversible, flagged
   default, not architectural drift.
4. **Mask convention.** fal flux inpainting inpaints the WHITE region of `mask_url`; our §5 mask is
   already white=edit on black, so — unlike the OpenAI adapter's alpha inversion — the signed mask
   URL passes through unchanged. §9.1's crop→composite-under-feathered-mask remains the hard
   enforcement regardless.
5. **Cost: no invented rate.** fal returns no authoritative per-call cost in the queue result and
   there is no confirmed fal rate (the model is unchosen). Deliberately added **no** cost-catalog
   entry — `lookupPricing('fal', …)` misses and the registry falls back to the §7 per-capability
   chain-head default (cost-defaults.ts), marked `authoritative:'dashboard'`. An invented provenance
   would be worse than the honest fallback. Add a fal entry once the model + a real dashboard figure
   are confirmed.
6. **No live call this session.** A live fal `image.inpaint` needs (a) a real §1 input image + mask
   = a fixture we don't have and were told not to synthesize, and (b) publicly-reachable signed
   input URLs. The existing validate harness uses a local-file store whose `signUrl` returns a local
   PATH — fal's servers cannot fetch that. So a live fal run additionally requires an S3-backed
   `AssetStore` (presigned URLs). Both are prerequisites, both are logged; nothing live was run or
   claimed.

## 4. Resolution

**New adapter** — `packages/providers/adapters/fal-image.ts` (`makeFalImageInpaintAdapter`):
- `slug: 'fal'`; `describeCapabilities` → `image.inpaint` (maxW/H 1024 default, `supportsSeed:true`,
  `supportsNegativePrompt:false`, `supportsMask:true`, `supportsReferenceImages:0`).
- `submit(key, req, ctx)` — requires ctx; signs `sourceImageKey` + `maskKey` via
  `ctx.signInputUrl(…, {ttlSec})`; POSTs the queue request with `Authorization: Key`; returns
  `{ providerJobId: request_id }`. Candidate count clamped 1..4; `seed` sent only when present.
- `poll(key, id)` — GET status; IN_QUEUE/IN_PROGRESS → `running`; COMPLETED → GET result → maps
  `images[].url` to `{ kind:'url' }` provider-native outputs (mimeType from `content_type`),
  `seedUsed` from result `seed`, `model` set for the catalog. No-images / result-error / unknown
  status → honest `failed` (never a silent drop). A 4xx/5xx on the status endpoint throws a mapped
  §4.3 ApiError so the chain records it.
- `cancel(key, id)` — best-effort `PUT .../cancel`.
- Error mapping: 429 → `PROVIDER_RATE_LIMIT`; 400/401/403/422 → `PROVIDER_REJECTED`; else `INTERNAL`.

**Registration/harness plumbing** (so the owner can flip fal live once prereqs land):
- `scripts/validate-provider-inpaint.ts` — added a `provider === 'fal'` branch (with an inline
  warning that the local-path store can't drive a live fal call — needs an S3 store).
- `scripts/wire-provider-connection.ts` — added a `fal` manifest entry mirroring the adapter, so
  `WIRE_PROVIDER=fal WIRE_KEYNAME=<line> …` encrypts + upserts the fal `provider_connections` row.
  (Not run this session — wiring the row does not authorize a live call.)

## 5. Verification

- **New adapter tests** — `packages/providers/adapters/fal-image.test.ts`, **10/10 PASS** (mock
  fetch, zero network/spend). Cover: signed-input URLs (inputs signed, never read as bytes), exact
  submit/status/result URLs + `Key` auth header, request body (`image_url`/`mask_url`/`prompt`/
  `num_images`), seed-only-when-present + candidate clamp, IN_QUEUE/IN_PROGRESS→running,
  COMPLETED→succeeded with URL outputs + seed + model, failed-not-dropped on no-images / result
  500, status-endpoint 429 → mapped ApiError, missing-ctx → INTERNAL, and the URL-output →
  `normalizeToAssetKeys` download → assetKey path end-to-end.
- **Full suite** — `vitest run` → **133/133 PASS, 15 files** (from 123/123 / 14 files; +10 in the
  one new file, no regressions). Node v22.23.1.
- **Preflight** — re-run → **PASS 13 / FAIL 4 / SKIP 1, unchanged** (the 4 FAILs are the undelivered
  §1 AI fixtures; my changes are additive adapter + script code, no fixture/toolchain impact).
- **NOT verified (owner gate + prereqs):** any live fal call, fal repair QUALITY, the real fal model
  id/schema, and fal pricing. None run, none claimed. This is PLUMBING validated by mocks only.

## 6. Affected files / components / tests / commits

- `packages/providers/adapters/fal-image.ts` — NEW (fal image.inpaint queue adapter)
- `packages/providers/adapters/fal-image.test.ts` — NEW (10 tests, mock fetch)
- `scripts/validate-provider-inpaint.ts` — added `fal` registration branch (+ S3-store caveat)
- `scripts/wire-provider-connection.ts` — added `fal` manifest entry (openai|google|fal)
- **Commit:** uncommitted at time of writing (owner did not request a commit; tree green besides logs).

## 7. Prevention / harvest

- **Verify a provider's HTTP contract against its own docs before coding it**, don't reconstruct
  from memory — fal's queue submit/status/result URLs + `Key` auth are now pinned in the file header
  with the doc URL + fetch date, so a future drift is auditable.
- **A flagged, configurable, reversible default is the correct way to honor "no assumptions" when a
  build is authorized but a sub-detail is unspecified** — the model id lives in `opts.model`, is
  documented as an OPEN DECISION, and changing it is a one-line edit, so nothing silently hardens.
- **URL-in/URL-out providers need an S3-backed store, not the local-file validation store** — record
  this prereq wherever a URL-based adapter is added so no one wastes a session trying to drive fal
  from a local path.
- Reusable seam confirmed: the Eli-Q2a `signInputUrl` + `{kind:'url'}` output + `normalizeToAssetKeys`
  design worked for the first real URL-based provider with zero interface changes.

## 8. Related entries

- `VHE-ISSUE-LOG-0024` — the `ProviderExecutionContext` / `signInputUrl` / native-output seam this
  adapter is the first real consumer of.
- `VHE-ISSUE-LOG-0022` — first real provider inpaint validation (OpenAI/Gemini); noted fal was
  reference-only for lack of a key. This entry supersedes that for fal (key now provisioned).
- `VHE-ISSUE-LOG-0018` — the visual fallback order that puts fal first.
- `VHE-ISSUE-LOG-0009` / `0011` — the four undelivered §1 fixtures that block live quality validation.

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each
> one signed and dated.

### 2026-07-23 06:50 EDT — post-build audit

`CODEX-SOL-01` / Codex Sol checked the uncommitted adapter against fal's official model API page,
the local provider contract, and the current §9.2/§9.5 boundary.

- **Model decision closed at the transport/schema level:** `fal-ai/flux-general/inpainting` is a
  published fal endpoint. Its official schema confirms `prompt`, `image_url`, `mask_url`,
  custom `image_size`, `num_images`, optional `seed`, optional `negative_prompt`, and
  `images[].url`. The default is therefore no longer an unverified model guess. This does **not**
  prove live quality or billing.
- **Two contract defects corrected:** (1) the endpoint supports `negative_prompt`; the adapter and
  wiring manifest incorrectly advertised `supportsNegativePrompt:false`; (2) the request omitted
  `image_size`, allowing the provider default to differ from the crop dimensions expected by the
  compositor. The adapter now advertises/sends negative prompts and sends the exact integer
  `{width,height}` requested. Mock contract coverage checks both.
- **Scope correction:** this adapter closes a real fal **still-image** `image.inpaint` transport
  lane for §9.1 and can serve §9.2's content-replacement keyframes once that orchestration is
  implemented. It does **not** provide `video.inpaint`, the default ProPainter-equivalent removal
  lane, or a complete hosted §9.2/§9.5 execution path by itself. fal publishes video-inpainting
  endpoints, but selecting/adapting one remains separate work because their video/mask/output
  contracts are materially different.
- Live call, real-fixture quality, provider billing, S3-backed signed-input delivery, and the
  §9.2/§9.5 video exit gates remain OPEN.
