# VHE-ISSUE-LOG-0032 — Consolidated removal-lane implementation specification (clean successor to 0031)

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0032 |
| **Date / time** | 2026-07-24 (late morning EDT) |
| **Logged by** | `CC-SONNET-01` — Claude Sonnet 5 |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §9.2 (video repair — removal path) · §9.5 (chunked windows) · §7 (routing/adapters/registry) · §6 (FFmpeg wrapper) · §5 (mask format) · §8 (SAM-2 tracking) · §4 (budget gate) |
| **Category** | Specification (design artifact) — a **clean consolidated rewrite**, per Eli's round-3 instruction: do not append a third correction to `0031`; write a successor entry instead |
| **Status** | **SPEC — written, awaiting RE-REVIEW (round 4). NOTHING built, NOTHING probed, NO spend. Supersedes `0031` for implementation.** |
| **Baseline commit** | `52e3277` (unchanged; spec only, no code) |
| **Supersedes** | `VHE-ISSUE-LOG-0031` for implementation. `0031` is now **frozen as history** — it is not to receive any further appended correction. Where `0031` and `0032` conflict, `0032` governs. |

---

## 0. Why this entry exists (and what it is NOT)

`VHE-ISSUE-LOG-0031` went through three review passes:

- **Round 1** (Eli, on `0029`): 14 corrections, folded directly into `0031`'s filed body when `0031` was
  written as `0029`'s successor. **This was a fold, not an appended correction** — `0031`'s body already
  reflects all 14 items; there is no separate "round 1 appended correction" text block to read.
- **Round 2** (Eli, on `0031` via `Progress-update 03`): verdict "folds the direction of all 14 original
  points, but not build-authorized — 6 complete, 7 partial, item 8 architecturally incorrect," with 9
  further numbered corrections, explicitly instructed to be **appended, not rewritten**. Done — this is
  `0031`'s **one and only appended correction** (dated 2026-07-24 evening, signed `CC-SONNET-01`).
- **Round 3** (Eli, on `0031` — body + the round-2 correction — via `Progress-update 04`): package
  confirmed healthy and spec-only, no source code changed since `03`, and **all 9 round-2 items
  genuinely present**. But verdict: **still not build-authorized** — several corrections describe the
  right direction without fully resolving the implementation contract, and the filed body/test/build
  sections remain internally contradictory in places the correction didn't rewrite in-line (by design,
  per the "append, don't rewrite" rule from round 2).

**Correcting a wording risk in `CURRENT-STATUS.md`:** prior status text referred to "`0031`'s two
correction rounds," which could be misread as two *appended* correction blocks. To be precise: `0031`
has **exactly one appended correction** (round 2's 9 items). Round 1's 14 items are not a separate
appended block — they are folded into the body itself. `CURRENT-STATUS.md` is corrected in this same
session to say this plainly (see the session's handoff).

**The owner's instruction for round 4:** do not append a third correction to `0031` — preserve it as
history, frozen, exactly as it stands (body + the one round-2 correction). Write this entry, `0032`, as
a **clean, consolidated implementation specification** that fully resolves what round 2 only pointed in
the right direction on. `0032` is self-contained: a future builder should be able to implement from
`0032` alone without cross-referencing `0031`'s appended correction to reconcile contradictions — `0031`
is background/history only from this point forward.

Explicitly, in producing this entry:

- **No code was written.** HEAD is still `52e3277`; suite/preflight untouched (153/153 · 13/4/1, not
  re-run because nothing changed).
- **No provider was called.** No probe, no submission, no spend. The zero-spend probe (§11 of this
  entry) is *specified*, not *executed*, and remains gated on explicit owner approval of key/network use.
- This spec is **additive** to VHE-2, same as `0031` was. It does not modify the frozen §7 `Capability`
  union. It **does** require additive, logged type/routing/storage/adapter-interface changes — those
  MUST be logged as §7-deviation-class changes **when built**, not silently.
- Facts not yet verifiable remain marked **[VERIFY — zero-spend probe]** and MUST NOT be assumed true at
  build time.
- **After filing this entry: STOP for re-review (round 4).** Nothing below is authorization to build.

This entry restates `0031`'s unchanged ground truth briefly (§1) and then works through the ten items
Eli's round-3 review named as still-unresolved, each as its own numbered section (§2–§11), followed by a
consolidated test plan (§12) and build order (§13).

---

## 1. Unchanged ground truth (carried forward from `0031`, not re-litigated)

These facts, established in `0031` §1–§2 against the code at `52e3277`, still hold and are not repeated
in full detail here — read `0031` §1–§2 for the underlying code-seam evidence if needed:

- **Decision 1 (adapter architecture):** ONE registered `fal` adapter keyed by slug (`fal`), with
  internal capability/operation dispatch to per-capability modules (existing image handler; new VOID
  removal handler). The global registry stays `Map<slug, adapter>` — **unchanged** by this entry, except
  for the `poll`/`cancel` signature change specified in §3 below.
- **Decision 2 (missing masks inside `[a..b]`):** hard-fail before submission, with exactly ONE targeted
  re-track attempt seeded from the nearest valid tracked mask; if still missing after that attempt, fail
  `MASK_TRACK_GAP` with the missing frame indices, no provider call. Black masks are valid ONLY for
  temporal-pad frames outside `[a..b]`. Bidirectional optical-flow recovery is explicitly out of scope
  for v1.
- **Two masks, never conflated:** the hard provider decision mask (thresholded, provider polarity/format
  — sent to VOID) and the soft local blend mask (feathered, canonical white=edit — used by the worker's
  compositor). Different artifacts, hashed separately.
- **The worker, not the adapter, materializes the provider-ready mask** before submission, because the
  adapter's execution context is input-only (`execution-context.ts:55-61`).
- **Compositing:** the removal lane composites back — only the masked pixels, under the soft local mask,
  over the ORIGINAL frames (`out = frame·(1−m) + patch·m`), same discipline as the content-replacement
  lane. It does not ship the provider's frame wholesale.
- **Mask-video encoder codec/container/pixel-format:** deferred to the zero-spend probe (§11). Recipe
  lives only in the §6 wrapper (`packages/media/ffmpeg.ts`), proposed name `encodeMaskVideoArgs`.
- **Provider-minimum duration handling:** pad both source and mask together up to the provider floor,
  submit, trim the repaired output back to the true window before compositing — **padding content is now
  fully specified in §9 below** (this is one of the ten items).
- **Output validation + MIME:** the returned video is validated (dims/fps/frame-count/duration) against
  the submitted (post-trim) window before trusting it; `ProviderNativeOutput.mimeType` is threaded end-to
  -end through `normalizeToAssetKeys` into a MIME-aware `AssetStore.store(bytes, hint, mimeType)` so
  extensionless outputs are no longer mis-typed `image/png`; `fetchUrl` gets a bounded/streaming download
  ceiling.

Everything else about the removal lane's contract is **resolved fresh below** — treat §2–§11 as the
authoritative, current specification for those areas, superseding both `0031`'s filed body and its
round-2 correction wherever they differ.

---

## 2. Discriminated request schema (resolves round-3 item 1)

`0031`'s round-2 correction made the removal-request fields "conditionally required + runtime-validated"
in prose, but left the request type itself as one flat `GenRequest` with optional fields checked by an
`if` at the boundary. Eli's round-3 finding: this still permits a request that satisfies the runtime
check by accident of omission (a missing `operation` doesn't necessarily route into the branch that
requires the other fields) — the schema itself must make the illegal state unrepresentable.

**Resolution — discriminate on `capability` + `operation` at the type level, not just at runtime:**

```
type GenRequest =
  | ImageInpaintRequest              // existing image.inpaint shape, unchanged
  | VideoRemoveRequest                // NEW — video.inpaint + operation:'remove'
  | VideoReplaceRequest;              // NEW — video.inpaint + operation:'replace' (content-replacement lane)

interface VideoRemoveRequest {
  capability: 'video.inpaint';
  operation: 'remove';                // literal, not optional — required by the discriminant itself
  sourceVideoKey: string;             // required, not `?`
  maskVideoKey: string;               // required, not `?`
  fpsNum: number;                     // required, positive integer
  fpsDen: number;                     // required, positive integer
  durationSec: number;                // required, positive
  width: number;                      // required, positive — processing dimensions (§4)
  height: number;                     // required, positive
  // ...remaining shared/optional fields (e.g. Pass2/SAM3 flags) unchanged
}
```

- **`operation` is required for every `video.inpaint` request** — there is no code path where a
  `video.inpaint` request can omit `operation` and still type-check or pass runtime validation. A
  missing `operation` on a `video.inpaint` request is a validation error at the request boundary, full
  stop — it cannot silently fall through to a code path that skips the `remove`-specific field checks.
- The discriminated union is validated with a schema library consistent with what `0029`/`0031` already
  assume for request validation (the existing request-boundary validator) — the discriminant field
  (`capability` + `operation` together) selects which required-field set applies, so "forgot to check
  `operation`" is no longer a possible implementation bug; the type system and the validator's discriminant
  both enforce it structurally.
- `fpsNum`/`fpsDen`/`width`/`height`/`durationSec` are validated **positive** (reject zero or negative)
  at the same boundary — round-2's correction required them "required" but did not state the positivity
  constraint explicitly; this closes that gap.
- This is an additive, logged §7-deviation-class change to the verbatim `GenRequest` type (same
  `0016`/`0018` class as `0031` §3.1) — to be logged as such **when built**.

---

## 3. Durable provider-job reference & real polling plumbing (resolves round-3 item 2)

`0031`'s round-2 correction required persisting `capability`/`operation`/`model`/handler-identity
alongside `providerJobId` in the durable record (§6 below), but — as Eli's round-3 review flagged — it
never changed the actual `poll()`/`cancel()` call signatures. Storing the data in a table that `poll()`
never receives does not fix the dispatch bug; the adapter's `poll(jobId: string)` still can't tell which
internal handler (image vs VOID) issued a resumed job.

**Resolution — a durable reference type, threaded through the adapter interface itself:**

```
interface ProviderOperationRef {
  providerJobId: string;
  handlerIdentity: 'fal:image' | 'fal:void';   // which internal module issued/owns this job
  capability: Capability;                       // e.g. 'video.inpaint'
  operation?: 'remove' | 'replace';             // present for video.inpaint jobs
  model: string;                                 // resolved model/endpoint id actually submitted to
  endpoint: string;                              // the fal queue endpoint path used
}
```

- **`ProviderAdapter.poll` and `ProviderAdapter.cancel` change signature** from `poll(jobId: string)` /
  `cancel(jobId: string)` to `poll(ref: ProviderOperationRef)` / `cancel(ref: ProviderOperationRef)`.
  This is a logged interface deviation on `ProviderAdapter` (§7-class), built once, applied to both the
  image and VOID handlers — the image handler's resumed polls gain the same correctness guarantee, not
  just the new VOID lane.
- The single `fal` adapter's internal dispatcher reads `ref.handlerIdentity` to route the poll/cancel
  call to the correct internal module (image vs VOID) **before** it needs any other context — this is
  what makes a resumed poll after a worker restart correct, because the caller never has to guess which
  module owns a bare job-ID string.
- The durable record (§6) is the **only** place `ProviderOperationRef` values are constructed from
  storage; a resumed worker reads the full row, reconstructs the `ProviderOperationRef`, and calls
  `poll(ref)` — it never calls `poll(providerJobId)` with a bare string.
- This closes the exact gap Eli flagged: persisting handler identity in a table nobody reads at poll time
  was insufficient; the plumbing itself (the function signature every caller must use) now makes the
  correct behavior the only compilable one.

---

## 4. Two-stage routing — scoped to the removal lane only, with a pre-job budget-gate plan (resolves round-3 item 3)

`0031`'s round-2 correction (item 3) replaced the circular "resolution before routing" flow with
two-stage routing (stage 1: filter on capability/operation/fps/duration/mask, dimension-independent;
stage 2: per-candidate, derive processing resolution inside the chain walk). Eli's round-3 finding: as
written this reads like a change to routing in general, which risks silently weakening the existing,
correct dimension check that ordinary (non-removal) routing already performs at filter time
(`routing.ts:44`, part of `manifestSatisfies`).

**Resolution — the two-stage pattern is scoped to `video.inpaint`+`remove` requests only:**

- `manifestSatisfies`'s existing dimension check (`req.width/height ≤ cap.maxWidth/maxHeight`) is
  **unchanged and still applies at stage-1 filter time for every other capability/operation**, including
  `image.inpaint` and `video.inpaint`+`replace` (content-replacement). Removing dimension from stage 1 is
  a **removal-lane-only** carve-out, not a generic routing change.
- For `video.inpaint`+`remove` requests specifically: stage 1 filters/ranks candidates on capability,
  `operation === 'remove'`, canonicalized fps (§1 item 1's GCD/cross-multiply rule, carried forward
  unchanged from `0031`'s round-2 correction), duration, and mask-support (checking `maskVideoKey`, not
  `maskKey`) — dimension is deferred to stage 2 **only for this lane**, because the removal lane's
  processing resolution is provider-dependent in a way the image/replace lanes are not (§9.2's
  composite-back-at-native design). Stage 2 (inside the chain walk, per-candidate) derives that
  candidate's processing resolution clamped to its manifest bounds, transforms source+mask together to
  it, then attempts submission.
- **Fall-through rule, stated precisely:** a routing candidate may be abandoned in favor of the next
  candidate **only** in two cases — (a) **before any submission attempt** (e.g., stage-2 transform or
  pre-flight fails for that candidate), or (b) **after a submission that is provably unaccepted** (the
  provider returned a definitive rejection — a 4xx/5xx with no job created, confirmed by the response,
  not a timeout or dropped connection). Once a submission's acceptance status is **unknown** (§5's
  ambiguous-submit state) or **confirmed accepted**, fall-through is **not permitted** — the walk must
  stop and either poll the accepted job or wait for reconciliation. This sharpens round-2 item 11's "no
  fall-through once accepted" into an explicit three-way rule (unaccepted → may fall through; unknown →
  must not; accepted → must not).
- **Pre-job route/cost plan for the §4 budget gate:** before a durable claim is written (§6) or any
  submission is attempted, the routing walk produces a **plan** for its current top-ranked candidate:
  `{ candidateConnectionId, estimatedProcessingWidth, estimatedProcessingHeight, estimatedCostCents,
  costProvenance }`. This plan is computed from the candidate's manifest bounds and the existing
  cost-catalog provenance pattern (`0024`/`0026` — fal returns no exact cost, so this is catalog-derived,
  not authoritative) — cheap, dimension-independent-input math only, no provider call. VHE-2 §4's budget
  gate consumes this plan to approve or reject the operation **before** the pipeline claims the job or
  spends anything, closing the gap where a per-candidate resolution chosen deep inside the chain walk
  previously had no upstream budget checkpoint that could see it coming.

---

## 5. One canonical ambiguous-submit state, in the lifecycle, non-retryable, tested (resolves round-3 item 4)

`0031`'s round-2 correction (item 4) offered two candidate names, `submission_unknown` /
`awaiting_reconciliation`, without picking one — a real gap, since a state machine needs exactly one
canonical value to transition into and query against.

**Resolution:**

- **Canonical state name: `submission_unknown`.** This is the value stored in the durable operation
  record's `state` column (§6). `awaiting_reconciliation` is retired as a candidate name — do not use it
  in code; if a human-facing label is wanted in the UI, it is a **display string** derived from the
  `submission_unknown` state, never a second state value.
- **Full job-lifecycle enum** (removal lane), each state's transition rules stated so `submission_unknown`
  sits in it unambiguously:
  `queued → claimed → submitted → { succeeded | failed | submission_unknown } ; submission_unknown → { in_flight (on reconciliation finding the job) | failed (on reconciliation confirming no job) } ; in_flight → { succeeded | failed | awaiting_approval }` —
  `awaiting_approval` is the new state from §10 (chunk overlap-quality gate failure), listed here for
  completeness of the enum, defined fully in §10.
- **`submission_unknown` is non-retryable by the pipeline itself:** no automatic transition out of
  `submission_unknown` exists. The only two ways out are (a) an explicit reconciliation check (operator
  or automated job-listing lookup against the provider) that resolves it to `in_flight` or `failed`, or
  (b) — if fal supports a client idempotency key (§11 probe item 7) — a safe resubmit using that key,
  which either reuses the original job (→ `in_flight`) or is provider-confirmed as a genuinely new
  submission only after the key mechanism itself guarantees no duplicate. The pipeline never silently
  retries a `submission_unknown` job with a plain resubmit.
- **UI-lifecycle mapping:** `submission_unknown` surfaces to the owner-visible job/asset UI as a distinct,
  non-dismissable "needs reconciliation" status — it is not folded into a generic "failed" or "processing"
  bucket, so an operator can find and act on it specifically.
- **Test requirement (added to §12):** a simulated submit whose response is lost/timed-out before a
  `providerJobId` is captured must be asserted to (a) transition the record to `submission_unknown`
  (never `failed`, never `succeeded`), (b) trigger **zero** automatic resubmits, (c) trigger **zero**
  fall-through to another routing candidate, and (d) remain in `submission_unknown` until an explicit
  reconciliation call changes it.

---

## 6. `provider_operations` table — concrete schema, scope, and retention (resolves round-3 item 5)

`0031`'s §9.2 (as corrected by round-2 items 2 and 5) described the durable record's required fields and
scoping in prose but never settled it as a concrete, buildable schema — Eli's round-3 finding.

**Resolution — a dedicated table, `provider_operations`:**

| Column | Type (conceptual) | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `ownerId` | uuid | scoping key (part 1 of 2) |
| `providerConnectionId` | uuid | scoping key (part 2 of 2) — the BYOK connection used |
| `cacheKey` | string (hash) | scoping key (part 3) — built per §7 below |
| `state` | enum | per §5's lifecycle: `queued`\|`claimed`\|`submitted`\|`submission_unknown`\|`in_flight`\|`succeeded`\|`failed`\|`awaiting_approval` |
| `providerJobId` | string, nullable | present once a submit is durably confirmed accepted |
| `handlerIdentity` | enum | `'fal:image'` \| `'fal:void'` (§3) |
| `capability` | string | e.g. `'video.inpaint'` (§3) |
| `operation` | string, nullable | `'remove'` \| `'replace'` (§3) |
| `model` | string | resolved model/endpoint id (§3) |
| `endpoint` | string | fal queue endpoint path (§3) |
| `requestParams` | jsonb | normalized request (processing dims, `fpsNum/fpsDen`, `durationSec`, flags) |
| `sourceIdentity` | jsonb | stable source identity/range tuple used in the cache key (§7) — NOT a container hash |
| `decisionMaskFrameHash` | string (hash) | canonical provider decision-mask frame hash used in the cache key (§7) |
| `submittedSourceHash` | string (hash) | audit-only: sha256 of the exact source-video bytes actually submitted |
| `submittedMaskHash` | string (hash) | audit-only: sha256 of the exact mask-video bytes actually submitted |
| `resultStorageKey` | string, nullable | the raw cached repaired-video bytes' storage key (renamed from `0031`'s ambiguous `resultAssetKey` — see §7) |
| `costCents` | integer, nullable | catalog-derived (fal returns no exact cost) |
| `costProvenance` | string | which catalog/estimate produced `costCents` |
| `retentionExpiresAt` | timestamp | see retention rule below |
| `createdAt` / `updatedAt` | timestamp | |

- **Unique constraint:** `(ownerId, providerConnectionId, cacheKey)` — exactly the scope Eli's round-3
  review specified. Switching BYOK connections, or two owners whose cache-key inputs happen to coincide,
  can never share or leak a cached result, and a duplicate write against the same triple is a conflict
  the pipeline treats as "already claimed" (feeds the cache-hit/in-flight branch, never a second row).
- **`resultStorageKey` vs. the Apply-time media asset:** `resultStorageKey` is the location of the raw
  repaired-video bytes as stored at repair time — nothing more. The permanent media asset and its
  `inpainted_from` lineage edge are created **only** when the user Apply's the result, which promotes (or
  copies) the `resultStorageKey` bytes into that permanent asset. This intersects the still-**deferred**
  §11 "Apply"/edit-graph work (`0020`/`0021`) — flagged as an explicit dependency, not invented here.
- **Retention — settled, not left open:** an unapplied `provider_operations` row's `resultStorageKey`
  bytes get a **default 7-day retention window** from `createdAt` (`retentionExpiresAt = createdAt + 7
  days`), after which they are eligible for a cleanup sweep if never applied. This is a **default**, not
  a hardcoded constant — the owner (Ashley) may change the window; until she does, 7 days is what ships.
  Applying the result **before** `retentionExpiresAt` promotes the bytes and cancels the pending sweep for
  that row (the row itself is retained for audit; only the raw-bytes cleanup is what the sweep affects).
  This closes round-2 item 5's `[OPEN — owner decision]` flag with a concrete default rather than leaving
  it unresolved into the build phase.

---

## 7. Cache-key construction — stable identity, not container hashes (resolves round-3 item 6)

`0031`'s §9.2 defined the cache key as a hash of `{model, modelVersion, sourceVideoHash, providerMaskHash,
requestParams}`, where `sourceVideoHash`/`providerMaskHash` were sha256 of the **encoded video/mask
container bytes**. Eli's round-3 finding: encoded-container hashes can differ across two otherwise
-identical encode runs even when the decoded frames are pixel-identical (container mux metadata,
timestamps, or encoder-internal nondeterminism the §6.2-equivalent determinism hierarchy — see §8 below —
explicitly does NOT guarantee away at the container-byte level). Using such a hash as a cache key means a
harmless re-encode could silently produce a cache **miss** where a **hit** was correct, wasting a
duplicate paid submission.

**Resolution:**

- **The cache key is built from:**
  1. **Stable source identity + range** — not a hash of re-encoded bytes, but the tuple
     `{ sourceAssetKey, paddedWindowStart, paddedWindowEnd }` (or the equivalent frame-range identity the
     extraction step already carries). The source asset itself is immutable once stored (an asset key
     never changes bytes), so identity + range is already a stable, deterministic input — no re-hash of
     an encode needed.
  2. **Processing-recipe data** — the normalized `requestParams` (processing `width`/`height`,
     `fpsNum`/`fpsDen`, `operation`, padding parameters per §9, any Pass2/SAM3 flags): all inputs that are
     set once per request, not re-derived by an encoder run.
  3. **The canonical provider decision-mask frame hash** — a hash of the **canonical decoded mask frame
     sequence** (post-threshold, the same decision-region-identity artifact §8's determinism hierarchy
     guarantees is stable), **not** a hash of the encoded mask-video container.
- **Cache key = stable hash of `{sourceAssetKey, paddedWindowStart, paddedWindowEnd, requestParams,
  decisionMaskFrameHash}`.** None of these components depend on encoder-run-specific container bytes.
- **Submitted-artifact hashes are recorded separately, for audit only — never used as cache-key inputs:**
  `submittedSourceHash` and `submittedMaskHash` (§6's table columns) are sha256 of the **exact bytes**
  actually sent to the provider on a given submission. They exist so a support/debug investigation can
  verify "this is precisely what fal received," but two submissions with the same cache key legitimately
  can have **different** `submittedSourceHash`/`submittedMaskHash` values (e.g., a re-encode with a
  different container timestamp) without that being a cache-key mismatch — that is the whole point of
  separating the two.

---

## 8. Determinism hierarchy — replaces `0031` §12.3 outright (resolves round-3 item 7)

`0031`'s round-2 correction (item 6) already moved away from unconditional raw-pixel identity toward a
tiered mandatory/conditional/optional structure, but `0031`'s own §12.3 (the golden-test section) was
never rewritten to match — it still read as if a single "decode both, assert every frame pixel-identical"
test were the whole story. Eli's round-3 review calls this out by name: §12.3 is stale.

**Resolution — the determinism hierarchy, stated once, and §12.3 is retired (§12 below is the sole test
spec for this area going forward):**

1. **MANDATORY, unconditionally:** two encodes of the same canonical mask input, after applying whatever
   thresholding the provider reads the mask as a binary decision with, must yield the **same decision
   region** — the same set of pixels classified erase-vs-keep. This holds regardless of the accepted
   format's compression characteristics, because it is evaluated **post-threshold**, not on raw sub
   -threshold pixel values.
2. **MANDATORY, conditionally:** full raw decoded-pixel identity (every frame, every pixel, exact match)
   is required **only if** the §11-probe-finalized accepted format is confirmed **lossless**. If the
   format is not strictly lossless, raw-pixel identity is **not** a valid bar to hold the encoder to —
   only tier 1 (decision-region identity) applies.
3. **OPTIONAL, either way:** byte-identical containers across two encode runs is a bonus, kept only if the
   finalized recipe happens to achieve it (e.g., with a `bitexact`-class flag), dropped without concern
   otherwise.
4. **If the probe cannot establish, from metadata alone, what threshold behavior a lossy accepted format
   implies** (i.e., it's unclear whether tier 1's decision-region guarantee actually holds for that
   format) — **STOP and request separate owner approval for a minimal, explicitly-scoped inference
   validation test.** This is not authorization to run that test; it is a requirement to ask, distinctly
   from the zero-spend probe's own gate. No inference proceeds without that separate approval.

`0031` §12.3's test text is superseded in full by this section plus §12's consolidated test list below —
a future builder implementing the golden tests should read §12 here, not `0031` §12.3.

---

## 9. Padding specification — exact, resolves round-3 item 8

`0031`'s round-2 correction (item 7) said source pad frames use "boundary-frame repetition" without
stating which boundary applies to pre- vs. post-padding, and never addressed audio at all. Eli's
round-3 review asks for both to be pinned down exactly.

**Resolution:**

- **Frame counts are computed from rational fps, never a float.** Given the provider's minimum duration
  floor `Dmin` (seconds, from the §11 probe) and the true window's duration `Dwindow` seconds (derived
  from `fpsNum/fpsDen` and the true frame count — an exact rational computation, no `parseFloat` anywhere
  in this path, per VHE-2 §0), the required total pad-frame count is
  `padFrames = ceil((Dmin − Dwindow) × fpsNum / fpsDen)` computed in integer/rational arithmetic. If
  `Dwindow ≥ Dmin`, `padFrames = 0` and nothing in this section applies.
- **Pre-padding** (frames prepended before the true window's first frame): each pre-pad frame is a
  **repetition of the true window's FIRST real source frame**.
- **Post-padding** (frames appended after the true window's last frame): each post-pad frame is a
  **repetition of the true window's LAST real source frame**.
- Where the total `padFrames` splits between pre- and post- (symmetric split, or all-pre/all-post) is a
  build-time implementation choice **as long as** each side's padding uses its own correct boundary frame
  per the rule above — this spec fixes *which frame* each side repeats, not the split ratio, since the
  split ratio has no correctness implication (both sides use real content, never black).
- **Mask padding, unchanged from `0031` §5.4 (restated for completeness):** every pad frame — pre or
  post — in the mask video is **all-black / no-edit**, regardless of what the corresponding source pad
  frame shows. This is intentional: the provider must never attempt to edit padding content.
- **Audio — resolved fresh, not addressed in `0031` at all:**
  - The video submitted to the provider is **video-only** — the source-window extraction/padding
    pipeline strips any audio track before the source video is encoded/submitted. Removal providers
    operate on visual frames only; sending audio wastes bandwidth and risks an unexpected provider-side
    audio re-encode the pipeline does not control.
  - The **original audio track** (from the source clip, not the padded/trimmed window) is preserved
    separately throughout the pipeline and is **remapped onto the final spliced output** at final
    assembly time — after the repaired window is trimmed back to the true `[a..b]` range and spliced
    into the full clip, the original audio is muxed back in unmodified over that final duration. The
    removal provider never sees, alters, or is a party to the audio path in any way.
- **Validation stays two-stage, unchanged from `0031`'s round-2 correction:** validate the full padded
  provider output first (dims/fps/frame-count/duration against the padded length actually submitted),
  then separately trim to the true window and re-validate the trimmed segment — each stage catches a
  different class of provider misbehavior, and this entry does not change that sequencing.

---

## 10. Chunker refactor — provider-agnostic core, seed exclusion, SSIM-failure halt (resolves round-3 item 9)

`0031`'s round-2 correction (item 8) correctly removed "global key/global seed" language from the
removal-lane §9.5 contract (VOID is seedless), but left the **existing** `chunked-repair.ts` untouched —
it remains a single, content-replacement-specific chunker with seed/keyframe fields baked into its core,
which the removal lane was told to "reuse... only" the window/tracking-carry/overlap/assembly/splice
pieces of, without a concrete plan for how a seed-bearing core reuses cleanly for a seedless lane. Eli's
round-3 review asks for that to be made concrete, plus specifies new required behavior on overlap-quality
failure that `0031` never addressed (silent-blend risk).

**Resolution:**

- **Refactor `chunked-repair.ts` into a provider-agnostic window/resume/overlap core**, parameterized by
  a pluggable per-lane "job executor" that the core calls for each child window (submit/poll/cache,
  matching whichever lane — content-replacement or removal — is running). The core owns: deterministic
  child windowing (W/O sizing), mask-tracking carry across chunk boundaries, deterministic child cache
  keys tying to §6's durable-claim/resume behavior (a resumed run reuses accepted child jobs without
  resubmission), overlap blending of adjacent outputs, assembly, and final splice.
- **Global keyframe/seed fields are lane-specific extensions to the core, not core-required inputs.** The
  content-replacement lane's executor plugs in its fixed seed + shared reference image; the removal
  lane's executor plugs in nothing seed-related — the core's window/resume/overlap logic runs
  identically for both lanes without ever requiring a seed value to exist. Concretely: the core's
  per-child-window function signature does not have a `seed` parameter; a lane that needs one carries it
  in its own executor closure, invisible to the core. This is what "reuse the core, exclude the seed"
  means in buildable terms — not a runtime `if (lane === 'removal') skip seed` branch inside a
  seed-shaped core, but a core that never had a seed parameter to skip in the first place.
- **Overlap SSIM-failure behavior — new, resolves the round-3-flagged gap:** when the overlap-quality
  gate (the existing SSIM-based check between adjacent child outputs) **fails its threshold**, the
  affected child/window transitions to the **`awaiting_approval`** state (added to §5's lifecycle enum).
  This halts that window's pipeline immediately:
  - **No silent blend** — the core does not fall back to blending the mismatched overlap anyway with a
    weaker guarantee.
  - **No automatic additional inference purchase** — the core does not, on its own initiative, resubmit
    the child window to the provider for a fresh attempt (that would be an unauthorized spend decision).
  - The window sits in `awaiting_approval` until an explicit approval action (owner or operator) either
    accepts the degraded blend as-is, or triggers a specific, deliberate re-run of that child. **Defining
    that approval action's UI/API is out of scope for this entry** — `0032` specifies only the halt
    behavior and the state it halts into; the resolution mechanism is a follow-up, not invented here.

---

## 11. Zero-spend probe plan — carried forward from `0031` §11, unchanged in substance, still gated

The probe reads schema/metadata ONLY — no media upload, no enqueue, no inference, nothing that can bill.
It remains gated on the owner's explicit approval of key/network use (the fal key file location is known;
its contents have NOT been read). If any endpoint's cost behavior is uncertain, STOP and ask the owner.

**[VERIFY — zero-spend probe] items (unchanged from `0031` §11, restated for a self-contained `0032`):**

1. Mask polarity — white or black region erased?
2. Mask pixel format/channels — greyscale/RGB/quad-mask/alpha?
3. Hard-binary vs. soft mask acceptance.
4. Accepted codec/container for the source and mask videos.
5. Duration/resolution/fps bounds (fills the `video.inpaint` manifest honestly).
6. Seed/determinism surface (confirms the seedless-provider assumption §10 depends on).
7. Idempotency key support (feeds §5's `submission_unknown` reconciliation path).
8. Exact request/response schema field names.

Until items 1–4 resolve, no mask video may be built to a locked format or submitted. If metadata alone
cannot resolve polarity or accepted decoder format, STOP and report that a separately-approved minimum
inference test would be required — same rule as §8 above for the determinism-hierarchy unknown, and the
same rule `0031` §11 already stated; not weakened here.

---

## 12. Consolidated golden-test plan (all synthetic, no network, no spend)

This section is the **sole** authoritative test list for the removal lane going forward — it supersedes
`0031` §12 in full (not just §12.3). Field/name updates from earlier drafts are folded in directly (no
`resultAssetKey` anywhere below — always `resultStorageKey`, per §6/§7).

1. **Discriminated schema validation (§2):** a `video.inpaint` request missing `operation` is rejected at
   the boundary with a validation error — assert this for every combination of otherwise-valid fields. A
   `video.inpaint`+`remove` request missing any of `sourceVideoKey`/`maskVideoKey`/`fpsNum`/`fpsDen`/
   `durationSec`/`width`/`height` is rejected. Zero or negative `fpsNum`/`fpsDen`/`width`/`height`/
   `durationSec` are rejected.
2. **Provider-job-reference dispatch (§3):** a resumed poll/cancel call constructed from a stored
   `ProviderOperationRef` dispatches to the correct internal handler (`fal:image` vs `fal:void`) by
   `handlerIdentity` alone, with no other context available — assert both directions.
3. **Two-stage routing, removal-scoped (§4):** with a synthetic manifest, assert (a) an `image.inpaint`
   or `video.inpaint`+`replace` request is still rejected at stage-1 filter time for out-of-bounds
   dimensions (unchanged generic behavior); (b) a `video.inpaint`+`remove` request is **not** rejected at
   stage 1 for dimensions, only at stage 2 per-candidate; (c) fall-through occurs for an unaccepted
   submission and does **not** occur for an unknown or accepted one; (d) the pre-job budget-gate plan is
   computed and available before any durable claim is written, and a rejected plan blocks the claim.
4. **Canonical ambiguous-submit state (§5):** a submit whose response is lost before capturing
   `providerJobId` transitions the record to `submission_unknown` (never `failed`/`succeeded`), causes
   zero automatic resubmits and zero fall-through, and remains until an explicit reconciliation call
   changes it.
5. **`provider_operations` scoping and retention (§6):** two requests with the same cache key but
   different `providerConnectionId` (or different `ownerId`) never share a row or a cached result — assert
   two independent rows. A row's `retentionExpiresAt` defaults to `createdAt + 7 days`. Applying a result
   before expiry cancels that row's pending cleanup sweep.
6. **Cache-key stability (§7):** two encodes of the same source window + same canonical decision mask,
   with deliberately different container timestamps/mux metadata, produce the **same** cache key (hit,
   not miss) but **different** `submittedSourceHash`/`submittedMaskHash` audit values — assert both halves
   of this explicitly (same key, different audit hash).
7. **Determinism hierarchy (§8):** decision-region identity is asserted unconditionally across two
   encodes. Raw-pixel identity is asserted **only** when the test's fixture format is marked lossless; the
   test explicitly skips (with a stated reason, not a silent pass) the raw-pixel assertion for a
   lossy-marked fixture.
8. **Padding (§9):** assert pre-pad frames equal the true window's first real frame (pixel-for-pixel);
   post-pad frames equal the true window's last real frame; all pad frames (pre and post) in the mask are
   all-black; `padFrames` count matches the exact rational-fps computation for a fixture `Dmin`/`Dwindow`
   pair with no floating-point fps anywhere in the computation path. Separately: assert the video
   submitted to the provider carries no audio stream, and assert the final spliced output's audio track
   matches the original source audio unmodified over the full output duration.
9. **Chunker core (§10):** assert the refactored core's per-child-window call signature has no seed
   parameter; assert a content-replacement-lane executor still receives its fixed seed via its own
   closure and produces unchanged behavior (existing chunker tests stay green — structure refactor, not a
   behavior change for that lane); assert a removal-lane executor runs with no seed value anywhere in the
   call chain. Assert a simulated overlap-SSIM failure transitions the affected child to
   `awaiting_approval`, performs **zero** additional submissions, and does **not** produce a blended
   output for that child.
10. **Missing-mask hard-fail (Decision 2, unchanged from `0031` §12.2):** a window with a mask gap inside
    `[a..b]` that the single re-track cannot fill throws `MASK_TRACK_GAP` listing the missing indices,
    with zero encode and zero provider-submit calls; a gap the re-track **can** fill proceeds, with the
    re-track attempted at most once; an interior gap is never silently blacked.
11. **Adapter dispatch (Decision 1, unchanged from `0031` §12.8):** one registered `fal` adapter routes
    `image.inpaint` to the image module and `video.inpaint`+`remove` to the VOID module; existing image
    -adapter tests stay green.
12. **Output MIME + bounded download (unchanged from `0031` §12.7):** a mocked VOID `video/mp4` output is
    stored with content-type `video/mp4`, not `image/png`; a mocked oversized download fails closed at the
    byte ceiling.

---

## 13. Consolidated build order — probe-first, all gated

1. **Zero-spend probe (§11)** — **gated on explicit owner key/network approval.** Resolves every
   `[VERIFY]` item, finalizes the mask-video encoder recipe and the manifest bounds. No media, no
   inference. This is step 1, before any implementation, per the discipline `0031`'s round-2 item 9
   established and this entry does not weaken.
2. **Discriminated request schema + validation (§2).** Tests: §12 item 1.
3. **`ProviderOperationRef` + `poll`/`cancel` signature change on `ProviderAdapter` (§3).** Applies to
   both the image and VOID handlers. Tests: §12 item 2.
4. **Two-stage routing, removal-scoped, + pre-job budget-gate plan (§4).** Tests: §12 item 3.
5. **Mask-video encoder + worker mask materialization** (recipe finalized from the probe; two-mask
   derivation; black-frame helper; missing-mask hard-fail + one re-track). Tests: §12 items 8, 10.
6. **One-fal-adapter refactor + VOID module** (structure refactor, image behavior unchanged; VOID module
   reuses the fal queue transport). Tests: §12 item 11.
7. **Routing wiring** — the `fal` `video.inpaint` manifest with probed bounds and `operations:['remove']`.
8. **Resolution + output handling** — per-candidate processing resolution, composite-back-at-native,
   provider-video validation, MIME threading, bounded download, video-only submission + audio strip/remap
   (§9). Tests: §12 items 8, 12.
9. **`provider_operations` table + durable claim/cache/lineage** (§6, §7) — persist-`ProviderOperationRef`
   -after-submit, `submission_unknown` handling, cache-key construction, retention sweep. Tests: §12 items
   4, 5, 6.
10. **Chunker core refactor** (§10) — provider-agnostic window/resume/overlap core, seed-exclusion for the
    removal lane, `awaiting_approval` on SSIM failure. Tests: §12 item 9.
11. **(Later, gated)** first live VOID inference; RIFE interpolation of non-key frames; bidirectional
    optical-flow interior-gap fallback (Decision 2, separate spec); the `awaiting_approval` resolution
    UI/API (§10, explicitly out of scope here).

**After logging this spec: STOP for re-review (round 4).** Do not proceed to step 1 (or any step) without
a fresh explicit owner go, and step 1 additionally needs explicit key/network approval, unchanged from
every prior gate in this project.

---

## 14. What I did / did NOT do this session

- **Did:** re-read `0031` in full (body + its one appended round-2 correction, 796 lines) directly rather
  than from memory; read the owner's relay of Eli's round-3 verdict and the ten specific items it named;
  claimed `0032` in the index; wrote this consolidated specification resolving all ten items as concrete,
  buildable contracts (discriminated schema, a real interface-signature change for provider-job
  dispatch, a removal-lane-scoped two-stage routing rule with an explicit fall-through policy and a
  pre-job budget-gate plan, one canonical ambiguous-submit state wired into a full lifecycle enum, a
  concrete `provider_operations` table with scope/retention settled, a cache-key definition built from
  stable identity rather than container hashes, a determinism hierarchy that actually replaces the stale
  golden-test section, an exact padding + audio-handling spec, and a provider-agnostic chunker-core
  refactor plan with a new SSIM-failure halt state); corrected the `0031` "two correction rounds" wording
  risk (documented here and fixed in `CURRENT-STATUS.md` this session).
- **Did NOT:** write or change any code; add any FFmpeg string; call any provider; run the probe; read the
  fal key contents; upload media; spend anything; modify VHE-2 or the §7 `Capability` union; append
  anything further to `0031` (preserved as frozen history, exactly per the owner's instruction); re-run
  the suite (nothing changed — remains **153/153 · preflight 13/4/1** from `0027`, HEAD `52e3277`).

## 15. Related entries

- `VHE-ISSUE-LOG-0031` — **superseded by this entry for implementation.** Preserved as history, frozen —
  body + its one appended round-2 correction, exactly as filed; not to receive a third appended
  correction. Read it only for the original code-seam evidence (`0031` §2) this entry did not re-derive.
- `VHE-ISSUE-LOG-0029` — the first removal-lane spec; background only, superseded by `0031` and now `0032`
  in a chain.
- `VHE-ISSUE-LOG-0028` §7a — the owner ruling both `0029`/`0031`/`0032` discharge (lane choice = fal VOID,
  existing `video.inpaint` capability, caching/dedup/lineage required, zero-spend-probe-only, spec-first
  gate).
- `VHE-ISSUE-LOG-0027` — the built content-replacement keyframe orchestration + S3 presign; the sibling
  lane whose composite discipline and (post-§10-refactor) chunker core this entry's removal lane shares.
- `VHE-ISSUE-LOG-0026` — the fal image adapter whose queue transport the VOID module reuses.
- `VHE-ISSUE-LOG-0025` — the original `chunked-repair.ts` deterministic chunker (`0025`), the thing §10
  refactors into a provider-agnostic core.
- `VHE-ISSUE-LOG-0024` — the `ProviderExecutionContext` + versioned cost-catalog patterns the `6§`/`§7`
  budget-plan and lineage record extend rather than fork.
- `VHE-ISSUE-LOG-0020` / `0021` — the still-deferred §11 "Apply"/edit-graph work the apply-time
  `inpainted_from` edge (§6) depends on.
- `VHE-ISSUE-LOG-0016` / `0018` — the §7-block `.docx` token-loss / logged-deviation precedent; every
  additive §7 type/manifest/storage/adapter-interface change in §2/§3/§4/§9/§10 must be logged as one when
  built.

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

_(none)_
