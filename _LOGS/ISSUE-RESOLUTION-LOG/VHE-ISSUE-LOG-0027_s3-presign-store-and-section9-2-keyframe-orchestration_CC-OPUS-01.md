# VHE-ISSUE-LOG-0027 — S3-backed AssetStore (SigV4 presign) + §9.2 keyframe content-replacement orchestration

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0027 |
| **Date / time** | 2026-07-23 07:05–07:30 EDT |
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §7 (adapters/routing) · §9.1 (image inpaint) · §9.2 (video repair) · §9.5 (global keys/seed) |
| **Category** | Build (owner-authorized) |
| **Status** | **RESOLVED** (both builds green) · live provider + repair-quality still OPEN (owner gate) |
| **Baseline commit** | `96fc986` (Codex Sol's fal-adapter commit; this session's work is uncommitted on top) |

---

## 1. What happened

Owner-authorized two tasks this session, after Codex Sol audited/committed the fal adapter (0026):

1. **Wire the reachable S3 service into the validation harness through a real S3-backed AssetStore**
   whose `signUrl` returns short-lived, publicly reachable presigned URLs (fal is URL-in/URL-out and
   needs its inputs fetchable by fal's servers). Add mock/unit coverage. Never print credentials.
2. After S3 is green, build ONLY the **no-spend §9.2 content-replacement orchestration** that routes
   each deterministic keyframe through `image.inpaint`. Do NOT make a live fal call, do NOT
   synthesize fixtures, and do NOT build/choose the video-removal (`video.inpaint`/ProPainter) lane.

The four frozen §1 fixtures remain missing → the real quality gate stays OPEN throughout.

## 2. Why it matters

- The fal adapter (0026) can only win a real job once `AssetStore.signUrl` yields a URL fal can
  actually fetch. The local-file store returns a local PATH; fal's servers can't reach it. Without a
  presigning store, fal is registered but un-runnable.
- §9.2 content replacement is the next deterministic, no-GPU step after the §9.2A core (0024): it is
  the stage that actually drives keyframe repairs through the provider chain — the piece that turns
  the deterministic math into repaired keyframes, without touching the GPU-blocked removal lane.

## 3. Attempted solutions / design decisions worth recording

1. **No new dependency for presigning.** The vetted `library/` ships `@aws-sdk/client-s3@3.1085.0`
   only — NO `@aws-sdk/s3-request-presigner`, and `@smithy/signature-v4@5.6.6` exists solely in the
   pnpm store (not importable from the project root without reaching into `.pnpm`, which is fragile).
   Per the `library/`-first discipline (CLAUDE.md: check before downloading), I implemented AWS SigV4
   query presigning with `node:crypto` only. Object PUT still uses the vetted client-s3. Adding an
   unvetted npm package would have been silent scope growth.
2. **Non-circular correctness anchor.** A hand-rolled SigV4 is worthless if its test just re-encodes
   the same (possibly wrong) implementation. So `sigv4Signature` is tested against AWS's PUBLISHED
   `get-vanilla` vector from the official SigV4 test suite: feeding AWS's documented canonical-request
   text + credentials yields AWS's documented signature `5fa00fa31553b73ebf1942676e86291e8372ff2a…`.
   That independently proves signing-key derivation + canonical hashing + final HMAC.
3. **Secret never leaks.** The secret access key is used only to derive the HMAC signing key; only the
   non-secret access-key id appears in `X-Amz-Credential` (as the presign spec requires). A test
   asserts the secret string never appears in a presigned URL.
4. **§9.2 orchestration reuses §9.1 wholesale.** Rather than fork a second inpaint path, the keyframe
   orchestrator calls the hardened `runImageInpaint` per keyframe, so every key inherits §9.1's
   crop→feather→composite→provider-size-clamp hardening (0020/0021). The global key set is computed
   once via `keyframeSet` (§9.5 guarantee), the one fixed seed is passed to every key, and
   candidate[0] is selected deterministically.
5. **Tracking method NOT chosen.** Per-keyframe masks and per-keyframe frame keys are INJECTED
   callbacks (`maskFor`/`frameKeyFor`). SAM 2 tracking (§8) / RAFT fallback / static key-frame mask
   all satisfy the same interface; the orchestrator picks none — that is a GPU/hosted decision out of
   scope here.
6. **Flagged, not silently chosen:** batch keyframe repair arguably wants ONE candidate per key to
   halve cost, but §9.1's pipeline enforces the 2–4 candidate band; a single-candidate batch mode is
   left as an owner decision (documented in code + here), default candidateCount = 2.
7. **Region caveat for live presign.** A presigned URL only validates when `region` is the storage's
   CONCRETE region; `.env`'s `S3_REGION=auto` cannot be signed. Documented in the module header; not
   exercised this session (no live call).

## 4. Resolution

**Task 1 — S3-backed AssetStore** — new `packages/storage/s3-store.ts`:
- `awsUriEncode`, `deriveSigningKey`, `sigv4Signature`, `toAmzDate` — SigV4 primitives (node:crypto).
- `presignS3Url(input)` — SigV4 query-presigned GET URL; path-style default (matches preflight),
  virtual-hosted supported; `UNSIGNED-PAYLOAD`, `host`-only signed header → fetchable with no headers.
- `makeS3AssetStore(cfg)` → `AssetStore`: `signUrl` (presign), `fetchUrl` (download any URL), `load`
  (presign+fetch our key, or pass through http key), `store` (content-addressed PUT via vetted
  client-s3, injectable `putObject` for tests). `makeS3AssetStoreFromEnv` reads S3_* from `.env`,
  throws a non-secret message on a missing var, prints nothing.
- Wired into `scripts/validate-provider-inpaint.ts`: fal → S3 store by default, openai/google keep the
  local store, `VAL_STORE=local|s3` overrides.

**Task 2 — §9.2 keyframe content-replacement orchestration** — new `packages/repair/keyframe-repair.ts`:
- `runKeyframeContentReplacement(params, deps)`: computes the global key set once (`keyframeSet`),
  routes each key through `runImageInpaint` with the one fixed seed, selects candidate[0], returns
  `{ keys, keyframes:[{frame,compositedKey,rawPatchKey,box,providerId,providerSlug,costCents}],
  totalCostCents, seed }`. Non-integer seed throws (determinism guard). NO interpolation, NO removal
  lane, NO live spend (injected `runGeneration`).

## 5. Verification

- **s3-store.test.ts — 13/13 PASS.** AWS `get-vanilla` known-answer; 32-byte signing key; awsUriEncode;
  toAmzDate; presign structure (host/path/all X-Amz params/64-hex signature); secret-never-in-URL;
  determinism + sensitivity to key/expiry/secret/clock; virtual-hosted style; store content-addressed
  + idempotent PUT; load presign+fetch; fetchUrl; http-key pass-through; non-2xx → error.
- **keyframe-repair.test.ts — 4/4 PASS.** Global key set routed once with the one seed on every call;
  candidateCount honored; cost sums; repaired keyframes are full asset-sized frames; reproducible
  across identical runs; single-frame (a===b) → one key; non-integer seed rejected.
- **Full suite** — `vitest run` → **150/150 PASS, 17 files** (from 133/133 / 15; +17 tests in 2 new
  files, no regressions). Node v22.23.1 (`%APPDATA%\fnm\node-versions\v22.23.1`).
- **Preflight** — **PASS 13 / FAIL 4 / SKIP 1, unchanged** (only the four undelivered §1 fixtures;
  S3/Postgres/Redis reachable; vendored FFmpeg 7.1.1 verified). Additive modules, no fixture/toolchain
  impact.
- **NOT verified (owner gate + prereqs):** any live fal/S3 GET, presign acceptance by the live
  endpoint (needs a concrete region + valid creds), and repair QUALITY. None run, none claimed.

## 6. Affected files / components / tests / commits

- `packages/storage/s3-store.ts` — NEW (SigV4 presign + S3 AssetStore)
- `packages/storage/s3-store.test.ts` — NEW (13 tests; AWS known-answer anchored)
- `packages/repair/keyframe-repair.ts` — NEW (§9.2 keyframe content-replacement orchestration)
- `packages/repair/keyframe-repair.test.ts` — NEW (4 tests, no-spend)
- `scripts/validate-provider-inpaint.ts` — MODIFIED (store selection: fal→S3, `VAL_STORE` override)
- **Commit:** uncommitted on top of `96fc986` (owner did not request a commit; tree green besides logs).
- `packages/repair/video-repair.ts` and the fal adapter were intentionally left UNTOUCHED.

## 7. Prevention / harvest

- **Known-answer > self-consistent.** When hand-implementing a spec (SigV4), anchor the test to the
  spec author's published vector, not to your own output. Harvest candidate: the `sigv4Signature`
  core + `get-vanilla` test are a reusable, dependency-free S3 presigner for the Soren library.
- **Check `library/` before adding a dep, even an "obvious companion."** `s3-request-presigner` looks
  like a natural sibling of client-s3 but wasn't vetted; node:crypto avoided the scope growth.
- **Reuse the hardened path.** §9.2 keyframe repair inheriting §9.1 means the 0020/0021 hardening
  can't drift out of sync between the still and video content-replacement lanes.

## 8. Related entries

- `VHE-ISSUE-LOG-0026` — the fal adapter whose URL-in inputs this S3 store now makes fetchable.
- `VHE-ISSUE-LOG-0024` — the `ProviderExecutionContext`/`signInputUrl` seam + §9.2A deterministic core
  this orchestration sits on.
- `VHE-ISSUE-LOG-0025` — §9.5 global-keys/one-seed guarantee the orchestration honors.
- `VHE-ISSUE-LOG-0021` / `0020` — the §9.1 hardening the keyframe path reuses.
- `VHE-ISSUE-LOG-0009` / `0011` — the four undelivered §1 fixtures blocking live quality validation.

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

### 2026-07-23 07:28 EDT — post-build audit

`CODEX-SOL-01` / Codex Sol audited the uncommitted implementation against the authoritative VHE-2
§9.2 text, AWS's published S3 query-presign example, and fal's confirmed image-inpaint schema.

- **Presign proof strengthened:** the original known-answer covered the SigV4 HMAC core, not the
  query-presign wrapper. Added an end-to-end known-answer test that reproduces AWS's published S3
  presigned URL and signature `aeeed9bb...d404` exactly. Added AWS-required expiry validation
  (integer 1–604800 seconds) and fail-fast rejection of missing/`auto` regions.
- **Blueprint defect corrected:** §9.2 requires “one fixed seed + shared reference.” The first build
  carried the seed but omitted the shared reference. `runKeyframeContentReplacement` now requires
  one `sharedReferenceImageKey` and sends the same reference on every keyframe request. The shared
  image flows through `runImageInpaint` into `GenRequest.referenceImageKeys`.
- **fal reference support completed:** the verified fal endpoint accepts `reference_image_url`.
  Its manifest now advertises one reference, the adapter signs/sends it, and the connection wiring
  mirrors the same capability. More than one reference is rejected.
- **Verification after corrections:** full Vitest **153/153 PASS (17 files)**; preflight remains
  **PASS 13 / FAIL 4 / SKIP 1**, with only the four frozen owner fixtures missing.
- No live fal/S3 call, fixture substitution, credential output, or provider spend occurred.
