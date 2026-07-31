# VHE-ISSUE-LOG-0033 — Binding correction to 0032 (round-4 final corrections): request family, state separation, concrete DB, two-artifact output, cache key, budget/fall-through safety, deterministic padding, overlap-approval contract, spend-safe build order

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0033 |
| **Date / time** | 2026-07-24 (afternoon EDT) |
| **Logged by** | `CC-OPUS-01` — Claude Opus 4.8 (owner switched model Sonnet→Opus via `/model`; identifier per registry convention) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" (this room is closing after this entry) |
| **Blueprint section(s)** | VHE-2 §9.2 · §9.5 · §7 · §6 · §5 · §4 (error taxonomy / worker / budget) · §2 (schema) |
| **Category** | Specification — a **concise binding correction** to `0032`, per Eli's round-4 review |
| **Status** | **SPEC — written, awaiting review in the new rooms. NOTHING built, NOTHING probed, NO spend.** |
| **Baseline commit** | `52e3277` (unchanged; spec only, no code) |
| **Relationship to 0032** | `0032` is preserved as the **base specification**; this entry is a **binding correction**. **Where 0033 conflicts with 0032, 0033 governs.** Read `0032` for the full contract, then this entry for the final corrections applied on top. |

---

## 0. Why this entry exists

Eli's round-4 review of `VHE-Progress-update 05` (37 files, 175,516 bytes, SHA-256
`FE9F49611567B5EBD2EB6C337393E4D40C6F8B87C439286B7DE00FD1533FDB55`) confirmed the package is healthy,
correctly structured, credential-free, and spec-only, and that `0032` successfully consolidates the
earlier review rounds — but it is **not yet build-authorized**. Nine final corrections follow. Per the
owner's instruction, `0032` is **not rewritten**; it stays the base spec and this entry binds over it.

Each correction below was **grounded against the real code at `52e3277`** (read this session), not
against 0032's prose — the citations are exact so a builder can verify them. **In producing this entry:
no code written, no provider called, no probe, no key read, no spend.** HEAD `52e3277`; suite/preflight
unchanged (153/153 · 13/4/1, not re-run — nothing changed).

---

## 1. Preserve the complete provider request family; make dispatch provider-neutral

**Ground truth (`types.ts:20-23`, `:41-55`, `:79-92`):** `Capability` is a **9-member** union —
`image.t2i`, `image.i2i`, `image.inpaint`, `image.inpaint.identity_ref`, `image.upscale`, `video.t2v`,
`video.i2v`, `video.inpaint`, `video.extend`. `GenRequest` is **one flat interface**, not a union.
`ProviderAdapter.poll(key, providerJobId, ctx?)` and `cancel(key, providerJobId)` take a **string** job
id.

**Correction (governs over `0032` §2, §3):**

- `0032` §2's illustrated `GenRequest` union listed only `ImageInpaintRequest`, `VideoRemoveRequest`,
  `VideoReplaceRequest`. Implementing that **literally would delete** `image.t2i`, `image.i2i`,
  `image.upscale`, `image.inpaint.identity_ref`, `video.t2v`, `video.i2v`, and `video.extend`. That is
  forbidden. **Define the discriminant additively:** keep the existing flat `GenRequest` fields valid for
  all capabilities that use them today, and introduce the `video.inpaint` discrimination as an **additive
  sub-union** (e.g. a `VideoInpaintRequest` narrowed by `operation: 'remove' | 'replace'` with the
  removal-required fields on the `'remove'` arm), layered onto the request type **without removing any
  existing capability's request shape**. No capability variant that compiles today may stop compiling.
- **Provider-neutral dispatch (governs `0032` §3's `handlerIdentity: 'fal:image' | 'fal:void'`):** the
  **global** `ProviderAdapter` interface must NOT carry a fal-only union. Use a namespaced **opaque**
  `dispatchKey: string`. fal supplies values like `fal:image` and `fal:void`; a future provider supplies
  its own namespace. The durable operation record (§3 below) persists `dispatchKey` as an opaque string,
  and the single fal adapter's internal dispatcher interprets its own namespace — the interface stays
  provider-agnostic. `0032`'s intent (correct poll/cancel dispatch after restart) is unchanged; only the
  **type** of the dispatch value changes from a fal-specific literal union to an opaque namespaced string.

---

## 2. Separate provider-operation state from workflow/job state

**Ground truth:** `jobs.status` CHECK (`schema:54-55`) **already** includes `awaiting_approval`.
`worker.ts executeClaimed` retries via `if (retryable && row.attempt < 3) throw e` (`:76`) — a
non-retryable code writes terminal `failed` and never re-invokes the handler (so never resubmits).
`errors.ts ErrorCode` is a closed union with a `retryable` flag per code.

**Correction (governs over `0032` §5's single lifecycle enum):**

- `awaiting_approval` does **NOT** belong in `provider_operations.state` — the provider operation may
  already have **succeeded** while overlap review is a downstream **repair-job** concern. Keep
  `awaiting_approval` on the **repair child job** (`jobs.status`, where it already exists).
- **Provider-operation state machine** (its own column, distinct from `jobs.status`):
  `claimed → submitting → in_flight → succeeded | failed`, with `submitting → submission_unknown` when
  the submission outcome is ambiguous. **Retire `0032`'s `submitted` state** — it never cleanly
  transitioned to `in_flight`. The path is: claim the row → `submitting` at POST → on a durably-captured
  job id, `in_flight` → poll to `succeeded`/`failed`; if the POST outcome is ambiguous, `submission_unknown`.
- **Map `submission_unknown` into the existing job/UI lifecycle explicitly:** add a **non-retryable**
  machine code **`PROVIDER_SUBMISSION_UNKNOWN`** to `errors.ts` (`retryable: false`). Because
  `executeClaimed` only re-throws when `retryable` is true, a `PROVIDER_SUBMISSION_UNKNOWN` failure
  writes a terminal job row and the **generic BullMQ retry path never resubmits it** — exactly the
  required guarantee. Reconciliation out of `submission_unknown` is a separate, explicit path (§3), never
  an automatic worker retry.

---

## 3. Concrete `provider_operations` schema — TEXT ULIDs, real FKs, state-driven cache behavior

**Ground truth:** every PK in `0001_schema.sql` is `TEXT` (ULID, per the `-- ulid` comment on
`media_assets.id`), **not** UUID. `jobs(id)` and `provider_connections(id)` are `TEXT`. `media_assets`
carries `storage_key`, `mime`, `sha256`, `fps_num`/`fps_den`, `frame_count`. `lineage_edges.relation`
includes `inpainted_from`.

**Correction (governs over `0032` §6, which used UUID-style scoping and `createdAt`-based retention):**

- **New table `provider_operations`**, following the project's TEXT-ULID convention, with at least:
  - `id TEXT PRIMARY KEY` (ULID)
  - `job_id TEXT REFERENCES jobs(id)`
  - `provider_connection_id TEXT REFERENCES provider_connections(id)`
  - source asset + mask references (the source asset id + the provider-ready mask reference)
  - `state TEXT` (the §2 provider-operation machine) + a **durable dispatch reference**
    (`provider_job_id TEXT`, `dispatch_key TEXT` per §1)
  - `provider_output_key TEXT` + `provider_output_mime TEXT` (raw provider result — §4)
  - `result_key TEXT` + `result_mime TEXT` (locally validated/composited result — §4)
  - `error_code TEXT` + reconciliation detail (`error_detail TEXT` / a reconciliation note)
  - `cache_key TEXT` (§5), audit hashes (§5), cost columns
  - `succeeded_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ`
- **Uniqueness/scoping:** scope the cache row by owner + provider connection + `cache_key`. Since
  `provider_connections.owner_id` already carries the owner, a unique index on
  `(provider_connection_id, cache_key)` is owner-safe (a connection belongs to exactly one owner); persist
  the owner explicitly too if a query path needs it without a join. (Supersedes `0032`'s
  `(ownerId, providerConnectionId, cacheKey)` UUID phrasing — same intent, correct ULID/FK form.)
- **Retention starts when a usable result is stored, NOT from `created_at`** — a long-running operation
  must not have its 7-day window shortened while it is still running. The retention clock is anchored to
  `succeeded_at` (when a usable, locally-validated `result_key` exists), default **7 days** (owner may
  change), and applying promotes the result before any sweep.
- **Cache-row behavior by state** (supersedes `0032`'s hit/in-flight/miss sketch):
  - `succeeded` → **reuse** the stored `result_key` (zero provider calls).
  - `submitting` / `in_flight` → **resume or wait** (poll the recorded `provider_job_id`; never a second
    submit).
  - `submission_unknown` → **reconcile** (explicit check against the provider; no automatic action).
  - `failed` → **no silent resubmit**; a retry requires an explicitly permitted retry path.

---

## 4. Two output artifacts — never promote raw provider output on Apply

**Ground truth:** `0032` §6/§7 used a single `resultStorageKey` described as raw provider-returned video,
then said it could be promoted into the permanent media asset — which **contradicts** the mandatory
soft-local-mask compositing (`0032` §1/§8: outside-mask pixels MUST come from the original frames).

**Correction (governs over `0032` §6, §7):** store **two separate artifacts**:

- **`provider_output_key`** — the raw provider result, retained for validation/audit only.
- **`result_key`** — the **trimmed, validated, locally composited** output, whose outside-mask pixels come
  from the **original** frames (the `out = frame·(1−m) + patch·m` discipline under the soft local mask).

**Only `result_key`** may be previewed, applied, promoted into `media_assets`, or attached to the
`inpainted_from` `lineage_edges` row. Raw provider output is never previewed, applied, or promoted.

---

## 5. Complete logical cache key

**Correction (governs over `0032` §7):** the cache key uses **stable source identity** = the source
**asset id AND its stored `sha256`** (not `sourceAssetKey` alone), plus:

- exact **true** source frame range (start/end, the true window before padding);
- explicit **pre/pad and post/pad counts** (per §7 below, post-only for v1);
- processing **dimensions** and **rational fps** (`fps_num`/`fps_den`);
- **operation** (`remove`/`replace`);
- provider **model, endpoint, and model/schema revision**;
- **mask polarity + threshold contract** (the §11-probe-resolved decision contract);
- **mask-encoder recipe version** (the §6 `encodeMaskVideoArgs` version);
- **local compositor/processing recipe version** (the soft-mask composite recipe version);
- **canonical decision-mask frame hash** (post-threshold decoded-frame hash, not a container hash).

**Exact submitted source/mask container hashes remain audit-only** (`submitted_source_hash`,
`submitted_mask_hash`) — never cache-key inputs. Two submissions with the same cache key may legitimately
have different submitted-container hashes.

---

## 6. Budget planning + fall-through safety

**Ground truth (`routing.ts:115-136`):** `walkChain` falls through to the next connection on **any** step
failure. Budget is live: `SUM(jobs.cost_cents)` for the owner/period vs `budgets.cap_cents`.

**Correction (governs over `0032` §4's "top-candidate-only" plan and 3-way fall-through rule):**

- A budget estimate for **only the top candidate** is insufficient when the pipeline may later fall
  through to a **more expensive** provider. Do **one** of:
  - reserve/approve the **conservative maximum** estimate across the **eligible fallback chain**, or
  - **recheck the budget before every later candidate** and **prohibit any fallback that exceeds the
    approved amount**.
- **Fall-through safety:** a **timeout, dropped connection, or generic provider 5xx is NEVER proof a job
  was unaccepted** — treat all three as **ambiguous** submission outcomes (→ `submission_unknown`, §2).
  Fall-through to another provider is allowed **only after a documented pre-acceptance rejection that
  guarantees no job was created** (e.g. a definitive 4xx validation refusal before the queue accepted
  anything). This tightens `0032` §4/§5: "unknown → must not fall through" now explicitly subsumes
  5xx/timeout/dropped-connection, and `walkChain`'s current unconditional fall-through must be replaced
  for this lane by a guard that only advances on a proven pre-acceptance rejection.

---

## 7. Deterministic provider-minimum padding

**Correction (governs over `0032` §9's build-time pre/post split choice):** for v1, **unless the
zero-spend probe proves a provider requirement to the contrary**, place **all** provider-minimum padding
**after** the true window, by **repeating its last frame**; the corresponding mask padding frames are
**black / no-edit**. Frame counts are computed from **rational fps** only (no float). This preserves the
true window's **starting index** and simplifies trimming, hashing, caching, and test reproducibility. The
pre/post split is **no longer** a build-time choice — it is post-only for v1.

---

## 8. Finish the overlap-approval contract (no reachable dead-end)

**Ground truth:** `jobs.status` already has `awaiting_approval`; the repair child job is the right home
for it (§2).

**Correction (governs over `0032` §10, which left the resolution API/UI "out of scope"):** define the
**minimum decision endpoint before implementation**, so `awaiting_approval` is not a reachable dead-end.
Actions:

- **accept** the degraded overlap;
- **rerun** that child with **explicit cost confirmation** and a **new deterministic attempt key** (must
  pass the budget gate; **never automatic**);
- **cancel** the repair.

The overlap **SSIM check operates on the locally composited repaired regions**, not on untrusted full
provider frames (ties to §4: the provider frame is never trusted wholesale).

---

## 9. Spend-safe build order + required tests

**Correction (governs over `0032` §13):** build the **durable operation table, state machine, cache
claim, reconciliation behavior, and retry protections FIRST** — **before** enabling any live-capable VOID
submit path. Keep the **VOID handler disabled behind a test-only / feature gate** until those protections
exist. (The zero-spend probe, `0032` §11, remains gated on explicit owner key/network approval and is
still the first authorized step against a live endpoint; nothing here authorizes it.)

**Add the missing tests** (beyond `0032` §12):

1. accepted-job restart **resumes polling with no second submit**;
2. cache **hit creates no provider call**;
3. an ambiguous **5xx / timeout creates no fall-through**;
4. a **more expensive fallback cannot bypass the budget** (reservation or per-candidate recheck);
5. **invalid provider dimensions / fps / frame count fail before compositing**;
6. **pixels outside the soft mask remain identical to the original**;
7. **Apply promotes the locally composited `result_key`, never raw `provider_output_key`**.

---

## 10. Net effect

`0033` corrects, over `0032`: the request family (additive, no capability dropped) + provider-neutral
`dispatchKey` (item 1); provider-operation state separated from job state, `submitted` retired,
`PROVIDER_SUBMISSION_UNKNOWN` non-retryable code added (item 2); a concrete TEXT-ULID
`provider_operations` table with `succeeded_at`-anchored retention and state-driven cache behavior (item
3); two output artifacts with only the composited `result_key` promotable (item 4); a complete cache key
on stable identity (item 5); budget reservation/recheck across the fallback chain + 5xx/timeout treated as
ambiguous, not unaccepted (item 6); deterministic post-only padding for v1 (item 7); a defined
overlap-approval decision endpoint with SSIM on composited regions (item 8); and a spend-safe build order
with the VOID submit path gated behind protections plus seven added tests (item 9). **`0032` remains the
base spec; `0033` governs where they conflict.** **Still NOT build-authorized** — awaiting review in the
new rooms. No implementation, key read, probe, inference, deployment, or spend is authorized by this
entry.

## 11. What I did / did NOT do this session

- **Did:** read `types.ts`, `migrations/0001_schema.sql`, `errors.ts`, `worker.ts`, `routing.ts` at
  `52e3277` to ground every correction in real code; claimed `0033` in the index; wrote this binding
  correction; kept `_IN-PROGRESS_CC-OPUS-01.md` current.
- **Did NOT:** write or change any code; add any FFmpeg string; call any provider; run the probe; read the
  fal key; upload media; spend anything; modify VHE-2 or the §7 `Capability` union; rewrite `0032`
  (preserved as base spec); re-run the suite (nothing changed — remains **153/153 · preflight 13/4/1**,
  HEAD `52e3277`).

## 12. Related entries

- `VHE-ISSUE-LOG-0032` — the **base specification** this entry binds over. Read `0032` first, then this.
- `VHE-ISSUE-LOG-0031` — frozen predecessor of `0032`; background only.
- `VHE-ISSUE-LOG-0028` §7a — the governing owner ruling the whole spec chain discharges.
- `VHE-ISSUE-LOG-0016` / `0018` — the §7-block logged-deviation precedent; every additive §2/§7
  type/schema/interface change in items 1–3 must be logged as one when built.

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

---

### Round-5 correction — Eli final corrections on `VHE-Progress-update 06` (2026-07-24, `CC-OPUS-01`)

**Source:** Ashley relayed the ChatGPT reviewer ("Eli") verdict on `VHE-Progress-update 06`. Verdict:
**the package is approved only for the zero-spend metadata probe; the removal-lane build is still NOT
authorized.** Instruction: do **not** rewrite `0032` or `0033`; **append** these eight final corrections
to `0033`. These refine — do not replace — the sections above; where a round-5 item further specifies a
section above, the round-5 text governs (same "later correction wins on conflict" rule the entry already
uses). Nothing here authorizes any build, key read, probe, network call, or spend.

**R5·0 — Probe-authorization status (recorded precisely, because the reviewer's own message conflicts).**
Eli's verdict says "approved only for the zero-spend metadata probe" and, in the same message, "No
removal-lane code, key access, network probe, upload, deployment, or spending unless Ashley explicitly
authorizes it." Those two statements conflict on the probe. The governing rule is unchanged and is
reaffirmed by Eli's own second sentence: **the zero-spend probe (`0032` §11) requires Ashley's SEPARATE
explicit key/network authorization; reviewer sign-off does not substitute for it.** Ashley relayed this
review and was away; she did **not** issue that separate go. **Therefore no probe was run this session —
no fal key was read, no network call was made, no media was uploaded, nothing was spent.** The reviewer
has cleared the probe *as the correct next step conceptually*; it remains gated on Ashley's explicit
key/network approval before it may execute.

**R5·1 — Final discriminated request union for `video.inpaint` (remove vs. replace).** This fixes the
final concrete shape §1 above described additively. Ground truth unchanged (`types.ts:20-23,41-55`): the
9-member `Capability` union and the existing flat `GenRequest` must both survive. Final contract:

- Keep the existing flat `GenRequest` as the request shape for the **eight** capabilities that use it
  today (`image.t2i`, `image.i2i`, `image.inpaint`, `image.inpaint.identity_ref`, `image.upscale`,
  `video.t2v`, `video.i2v`, `video.extend`) — **no field of any of those is removed or narrowed.**
- Introduce `video.inpaint` as an **additive discriminated sub-union** on a required literal
  `operation: 'remove' | 'replace'`:
  - `VideoInpaintRemoveRequest` = `{ capability: 'video.inpaint'; operation: 'remove'; sourceVideoKey;
    maskVideoKey; fpsNum; fpsDen; durationSec; width; height; … }` — all listed fields **required and
    validated positive** (no `?`), `operation` required by the discriminant itself.
  - `VideoInpaintReplaceRequest` = the content-replacement arm = `{ capability: 'video.inpaint';
    operation: 'replace'; … }` carrying the replace lane's own required fields (reference image, etc.).
- The top-level request type is therefore `GenRequest | VideoInpaintRemoveRequest |
  VideoInpaintReplaceRequest` (the `video.inpaint` arm split out of the flat interface, everything else
  untouched). A `video.inpaint` request that omits `operation`, or omits any arm-required field, fails at
  the request-boundary validator — it cannot type-check and cannot fall through to a path that skips the
  arm's field checks. **No capability variant that compiles today may stop compiling** (the §1 invariant).
  This is an additive, logged `0016`/`0018`-class §7-deviation to be logged **when built**.

**R5·2 — Provider-manifest fields for supported operations and rational fps.** §2/§4 of `0032` referenced
`operations[]` and canonicalized fps but never pinned the manifest shape. Final: the `video.inpaint`
manifest entry must carry, at minimum — (a) `operations: ('remove' | 'replace')[]` (a manifest that does
not list `'remove'` is filtered OUT at stage-1 routing for a remove request); (b) rational fps bounds as
**integer pairs only** — `minFpsNum/minFpsDen` and `maxFpsNum/maxFpsDen` (or an explicit supported-fps
list of num/den pairs) — **never a float fps field** (VHE-2 §0); (c) the existing duration and dimension
bounds. `manifestSatisfies` compares the request's `operation` against `operations[]` and the request's
rational fps against the rational bounds by cross-multiplication (no float). Manifests are hydrated per
the `0024` hybrid manifest-cache seam; bounds unverifiable without the probe stay `[VERIFY — zero-spend
probe]` and must not be invented.

**R5·3 — Full `submission_unknown` reconciliation lifecycle, with no resubmission.** §2/§3 named the
state and the non-retryable code; this specifies the exit path in full. A `provider_operations` row in
`submission_unknown` leaves it **only** via an explicit, read-only reconciliation procedure — never a
resubmit, never an automatic worker retry:

1. Reconciliation reads the durable row's dispatch reference (`dispatch_key` + any captured
   `provider_job_id`) and performs a **read-only provider status/list query** for that operation. If the
   probe (`0032` §11 item 7) confirms a client idempotency key, the key recorded at submit time is the
   correlation handle; if not, correlation is by the provider's returned job id and/or a
   listing-by-time+params lookup — **still read-only**.
2. Outcomes: **found + accepted/running** → transition `→ in_flight` and resume polling the existing job
   (no new submit). **Provider definitively confirms no job was ever created** → transition `→ failed`
   with `PROVIDER_SUBMISSION_UNKNOWN` recorded, and only then is an explicitly-permitted *fresh* attempt
   (a new operation row, new attempt key) allowed. **Still indeterminate** → the row **stays**
   `submission_unknown`; reconciliation may be retried later, but the pipeline performs **zero** submits
   while indeterminate.
3. Reconciliation is idempotent: repeated runs against the same row that is already resolved are no-ops;
   two concurrent reconciliations are guarded by the same atomic row claim as §R5·4.

The guarantee: no code path transitions *out of* `submission_unknown` by POSTing a new inference. A
resubmit is only ever a brand-new operation row created *after* the provider has confirmed no job exists.

**R5·4 — Atomic provider-operation claim/retry schema that preserves attempt history.** §3's table is
extended so that (a) claiming an operation is atomic and single-winner, and (b) retries never overwrite
prior attempts. Final:

- **Atomic claim:** a worker takes an operation by a conditional write that only one worker can win — a
  guarded `UPDATE provider_operations SET state='submitting', claimed_by=?, claimed_at=now() WHERE
  id=? AND state IN ('claimed')` (or an equivalent `INSERT … ON CONFLICT DO NOTHING` on the
  `(provider_connection_id, cache_key)` unique index for first creation). A worker proceeds **only if the
  guarded write affected exactly one row**; zero rows affected ⇒ another worker owns it ⇒ this worker does
  not submit. This is the same optimistic-claim discipline `0015`/§4 already established for `jobs`.
- **Attempt history preserved, never overwritten:** each submission try is recorded as its own immutable
  **attempt record** — a child table `provider_operation_attempts` (TEXT-ULID PK, FK to
  `provider_operations(id)`, `attempt_no INTEGER`, `attempt_key TEXT` (the deterministic idempotency/
  attempt key), `state_at_attempt TEXT`, `dispatch_key TEXT`, `provider_job_id TEXT NULL`, `error_code
  TEXT NULL`, `submitted_source_hash`, `submitted_mask_hash`, `cost_cents NULL`, `created_at`). A retry
  or reconciliation-driven fresh attempt **inserts a new attempt row**; it never mutates a prior one. The
  parent `provider_operations` row's `state`/`provider_job_id` reflect the *current* attempt, while the
  full attempt history remains auditable — required for the "no duplicate paid submission" audit trail.

**R5·5 — Structured submission result; only `preaccept_rejected` may fall through.** This tightens §6 and
`0032` §4/§5 into a single typed result the submit path must return. Every submission attempt resolves to
exactly one of three variants:

- `preaccept_rejected` — the provider definitively refused **before** creating any job (e.g. a validation
  4xx returned before the queue accepted anything, with the response proving no job was created). **This
  is the ONLY variant permitted to fall through** to the next routing candidate.
- `accepted` — a provider job id was durably captured. Fall-through is forbidden; poll the accepted job.
- `ambiguous` — timeout, dropped connection, generic 5xx, or any outcome where acceptance cannot be
  proven either way. Maps to `submission_unknown` (§R5·3). **Never proof of non-acceptance; never a
  fall-through.**

`walkChain`'s current unconditional fall-through (`routing.ts:115-136`) is replaced, for this lane, by a
guard that advances **only** on `preaccept_rejected`.

**R5·6 — One atomic budget-reservation design (choice made, not left open).** §6 offered two options;
Eli required exactly one. **Chosen design: reserve the conservative maximum estimate across the entire
eligible fallback chain, atomically, before the first submit.** Concretely: before any durable claim or
submit, compute the cost estimate for **every** connection in the eligible fallback chain for this
request (each from its manifest bounds + the `0024` versioned cost catalog, catalog-derived, no provider
call), take the **maximum**, and reserve that amount against the owner's budget in one atomic write; the
operation proceeds only if the reservation succeeds. On terminal outcome the reservation is reconciled to
actual (released down to the real `cost_cents`, or fully released on failure). **Rationale for choosing
this over per-candidate recheck:** the reservation is taken once, up front, atomically — it eliminates
the check-then-act (TOCTOU) window in which a concurrent job could consume the headroom mid-chain, and it
cannot let a mid-chain fall-through to a *more expensive* provider slip past a budget that was only sized
for the cheapest candidate. The per-candidate-recheck alternative is **retired** for this lane. (Spec
choice, reversible; **Ashley may overrule** the reservation model — logged here so it is not a silent
pick.)

**R5·7 — Idempotent accept / rerun / cancel for overlap decisions.** §8 defined the three decision
actions; this makes each idempotent so a duplicate/retried decision request cannot double-act (e.g.
double-charge a rerun). Each decision is issued against a specific `awaiting_approval` child job **plus
its current attempt token** (the `attempt_key`/state token of the attempt under review):

- **accept** — records the degraded-overlap acceptance and moves the child forward. Replaying the same
  accept against the same attempt token is a **no-op** (already accepted ⇒ return the existing outcome),
  never a second state change.
- **cancel** — cancels the repair child. Replaying cancel against an already-cancelled child is a no-op.
- **rerun** — the only spend-capable action. It requires (a) explicit cost confirmation, (b) passing the
  §R5·6 budget reservation, and (c) minting a **new deterministic attempt key** → a **new
  `provider_operation_attempts` row** (§R5·4). Idempotency: a rerun request carrying an attempt key that
  already exists is **deduplicated** to that existing attempt (returns it; does **not** submit again), so
  a retried/duplicated rerun click cannot create a second paid submission. Rerun is never automatic.

SSIM for the accept decision is evaluated on the **locally composited** repaired regions, not raw
provider frames (unchanged from §8).

**R5·8 — Exact spend-safe build order (stated as an ordered sequence).** This states §9's order as the
canonical numbered sequence Eli asked for. No step may begin before the one before it is complete and its
tests are green:

1. **Zero-spend metadata probe** — gated on Ashley's separate explicit key/network approval (§0/§R5·0);
   resolves the `[VERIFY]` items, mask-encoder recipe, and manifest bounds. No media, no inference.
2. **Contract/spec + type updates** — the discriminated request union (§R5·1), manifest fields (§R5·2),
   provider-neutral `dispatchKey`, structured `SubmissionResult` type (§R5·5), error code
   `PROVIDER_SUBMISSION_UNKNOWN`. Additive, logged `0016`/`0018`-class deviations. No live capability yet.
3. **Durable protections** — `provider_operations` + `provider_operation_attempts` tables, the
   provider-operation state machine, the **atomic claim** (§R5·4), the **reconciliation** path (§R5·3),
   the retry/no-resubmit guards, the cache-key + cache-behavior (§5 above), and the **atomic budget
   reservation** (§R5·6). Built and unit-tested against synthetic data — still no live submit.
4. **Disabled / mock VOID build** — the VOID removal handler behind a test-only feature gate; it exercises
   the full path against a **mock** provider transport only. The live-capable submit path stays disabled.
5. **Tests all green** — the `0032` §12 list + the seven §9 additions + the round-5 tests below, all
   passing against mocks/synthetic fixtures, before anything live is contemplated.
6. **Separate explicit Ashley approval, THEN first paid inference** — only after 1–5 are complete and
   green does the live VOID submit path get feature-enabled, and only under Ashley's fresh, separate,
   explicit authorization of paid inference (distinct from the probe approval in step 1).

**Round-5 added tests** (beyond `0032` §12 and §9's seven): (a) a `video.inpaint` request missing
`operation` fails validation while all eight flat-`GenRequest` capabilities still compile/validate
unchanged; (b) a manifest lacking `'remove'` in `operations[]` is filtered out at stage-1 for a remove
request; (c) reconciliation out of `submission_unknown` issues **zero** submits in every branch
(found→in_flight, confirmed-absent→failed, indeterminate→stays); (d) two workers racing the atomic claim
result in exactly one submit and one winning claim; (e) a retry inserts a **new** attempt row and never
mutates a prior attempt row; (f) a submit returning `ambiguous` (5xx/timeout) produces no fall-through and
no second submit, and only `preaccept_rejected` falls through; (g) a duplicated `rerun` decision carrying
an already-seen attempt key creates **no** second paid submission.

**Verified `VHE-Progress-update 06` ZIP record (measured on disk this session, not transcribed):**

- File on disk: `C:\Users\user\Documents\VHE Backups\VHE FOR Review\VHE-Progress-update 06_2026-07-24.zip`.
- **SHA-256: `32d5bfb797896ce34c6bc315833628279577ecab5546af0406c0c3b7d1d0fe51`** — matches the reviewer's
  cited hash exactly (proves it is the same file the reviewer read).
- **Size: 195,431 bytes** (measured via `stat`). **Discrepancy flagged:** the reviewer's message cited
  "462,775 bytes." Because the SHA-256 matches, the file is provably identical; the 462,775 figure is a
  transcription/measurement slip on the reviewer's side, and **195,431 bytes is the verified true size.**
- **Entries: 42** = 41 files + `EXCLUDED-BINARIES-MANIFEST.md` (the reviewer's "42 files" is the same
  count, phrased without separating the manifest). Verified earlier at build time: 0 backslash entry
  paths, no `.env`, no binaries, directory structure preserved (`0030` method).

**What I did / did NOT do (round-5 append):** *Did* — verified the ZIP hash/size on disk; read `0032` and
`0033` in full and re-checked LOG-INDEX; appended these eight corrections + the ZIP record. *Did NOT* —
write or change any code; add any FFmpeg string; run the probe; read the fal key; call any provider;
upload media; spend anything; rewrite `0032` or `0033`'s body; modify VHE-2 or the §7 `Capability` union;
re-run the suite (nothing changed — remains **153/153 · preflight 13/4/1**, HEAD `52e3277`). **Still NOT
build-authorized.** Next authorized action is packaging `VHE-Progress-update 07` for review; the probe
still awaits Ashley's separate explicit key/network go.

— `CC-OPUS-01` (Claude Opus 4.8), 2026-07-24

---

### Round-6 correction — Eli final blockers on `VHE-Progress-update 07` (2026-07-24, `CC-OPUS-01`)

**Source:** Ashley relayed the reviewer ("Eli") verdict on `VHE-Progress-update 07`. Package audit passed
(152 entries, 938,101-byte ZIP, SHA-256 `8A190B1569BA74E9A45038D5509658F3688C85D5BC11A240C18E912CA36AC749`).
Verdict: **probe-only approval remains; removal-lane implementation is still rejected** with six blockers,
plus two log-hygiene corrections. Instruction: append to `0033` (do not rewrite `0032`/`0033`), update the
logs, build `VHE-Progress-update 08`. Nothing here authorizes any build, key read, probe, network, deploy,
or spend without Ashley's explicit go. All six resolutions below are grounded against the **real schema at
`migrations/0001_schema.sql`** (read this session): `jobs.status ∈
('queued','running','awaiting_approval','succeeded','failed','canceled')` — note the spelling **`canceled`**
(one L); `budgets(owner_id PK, cap_cents, period_start)` with spend computed live as
`SUM(jobs.cost_cents) WHERE owner_id=? AND created_at >= period_start`; no `provider_operations`,
`provider_operation_attempts`, or `budget_reservations` table exists yet — all are additive, logged
`0016`/`0018`-class schema deviations when built.

**R6·0 — Two corrections of my own prior errors (round-5), plus log hygiene.**

- **The `06` byte-count is NOT a transcription error — I was wrong to call it one.** Verified this session
  by summing `06`'s zip entries: **uncompressed content = exactly 462,775 bytes**; the compressed ZIP file
  on disk = **195,431 bytes**. The reviewer's `462,775` is `06`'s *extracted content size*; my `195,431`
  is its *compressed ZIP file size*. **Both are correct measurements of different quantities.** Round-5's
  "transcription/measurement slip on the reviewer's side" characterization is **retracted**; there was no
  reviewer error. (Going forward, package records state the compressed ZIP file size **and** note it is the
  compressed figure, to avoid conflating the two.)
- **Build-metric placeholders in the packaged logs — root cause and fix.** The reviewer correctly saw
  unfilled `_[to be recorded after build …]_` placeholders inside `07`'s copies of `CURRENT-STATUS.md` and
  handoff 32. Cause: those files were written with placeholders, the ZIP was built, and the real metrics
  were filled in **on disk afterward** — so the on-disk files are correct but the in-ZIP snapshots froze
  the placeholder. Root fix for `08` onward: a package can never contain its own SHA-256/size, so the
  in-package status/handoff will **state prior packages' real metrics** and, for the current package, say
  explicitly "self-metrics recorded on disk after packaging (a ZIP cannot contain its own hash) — see
  `README.md`/`CURRENT-STATUS.md` on disk," rather than a fill-in-later placeholder that reads as unfinished.

**R6·1 — Legacy request arm must exclude `video.inpaint` (fixes R5·1).** R5·1 kept the base `GenRequest`
with `capability: Capability` (all nine members) and unioned the two video-inpaint arms onto it — so
`{ capability: 'video.inpaint' }` **without** `operation` still satisfied the base arm. Correction:
constrain the base arm's discriminant so `video.inpaint` is unrepresentable except through an operation-bearing arm:

```
interface BaseGenRequest {
  capability: Exclude<Capability, 'video.inpaint'>;   // all 8 non-video.inpaint capabilities
  // …existing flat GenRequest fields, unchanged…
}
type AnyGenRequest =
  | BaseGenRequest
  | VideoInpaintRemoveRequest    // { capability:'video.inpaint'; operation:'remove';  … }
  | VideoInpaintReplaceRequest;  // { capability:'video.inpaint'; operation:'replace'; … }
```

Now a `video.inpaint` request with no `operation` matches **no** arm (excluded from the base, rejected by
both video arms) — the illegal state is unrepresentable at the type level, not merely at runtime. This is
an additive, logged `0016`/`0018`-class §7-deviation to the verbatim request type, to be logged when built.

**R6·2 — One exact rational-fps manifest shape (fixes R5·2's "bounds OR list" alternative).** Chosen shape,
no alternative: **explicit min/max rational bounds as four integer fields** on the `video.inpaint` manifest
entry — `minFpsNum, minFpsDen, maxFpsNum, maxFpsDen` (all positive integers; matches VHE-2's flat
`fps_num`/`fps_den` convention). **No supported-fps list.** A request fps `reqNum/reqDen` is in range iff,
by integer cross-multiplication (no float, VHE-2 §0):
`minFpsNum * reqDen ≤ reqNum * minFpsDen` **AND** `reqNum * maxFpsDen ≤ maxFpsNum * reqDen`. A provider that
accepts exactly one fps sets `minFps* == maxFps*`. The "explicit supported list" option is **retired**;
`manifestSatisfies` implements exactly the two cross-multiply comparisons above for this lane.

**R6·3 — `submission_unknown` reconciliation: exact job-state transitions, no resubmission (fixes R5·3 job
side).** R5·3 defined the *provider-operation* transitions but not how the *repair job* leaves the dead end.
Root refinement — do **not** write the repair job to terminal `failed` on an ambiguous submit (a terminal
state cannot cleanly resume). This **supersedes** the round-4 §2 / R5·3 "non-retryable code writes a
terminal `failed` job" mechanism **while preserving its invariant** (BullMQ must never auto-resubmit):

- **On ambiguous submit:** the worker does **not** throw. It writes `provider_operations.state =
  'submission_unknown'`, records `PROVIDER_SUBMISSION_UNKNOWN` on the current attempt row (audit), sets the
  repair job to a **new additive** `jobs.status = 'awaiting_reconciliation'` (added to the CHECK
  constraint; non-terminal; **not** picked up by the BullMQ retry path because the worker returns normally
  rather than throwing a retryable error), and returns. No resubmit, no fall-through.
- **Reconciliation endpoint** (explicit operator action + optional scheduled sweep; input =
  `provider_operation_id` or `job_id`; performs a **read-only** provider status/list query only; idempotent;
  never POSTs an inference):

  | Provider finding | provider-op transition | repair-job transition | side effect |
  |---|---|---|---|
  | found accepted/running | `submission_unknown → in_flight` | `awaiting_reconciliation → running` | enqueue a **poll-only** continuation that calls `poll(ref)` on the existing `provider_job_id` — guarded so it can never submit |
  | provider confirms no job was ever created | `submission_unknown → failed` | `awaiting_reconciliation → failed` (terminal) | a fresh attempt is a **separate explicit** action (new attempt row on the **same** operation, per R6·4) |
  | still indeterminate | stays `submission_unknown` | stays `awaiting_reconciliation` | may be re-checked later; **zero** submits meanwhile |

- The poll-only continuation is a distinct execution mode of the `repair.range` job that takes an existing
  `provider_job_id` and only polls/downloads/validates/composites — it has **no** submit branch, so a
  resumed job structurally cannot create a second provider job.

**R6·4 — Retry reuses the parent operation; never a conflicting new row (fixes R5·3/R5·4).** R5·3's "a new
operation row" would violate the `provider_operations` **unique `(provider_connection_id, cache_key)`**
index. Correction: a retry/rerun **never creates a second `provider_operations` row.** The unique
`(provider_connection_id, cache_key)` row is the **durable parent** for the logical operation for its whole
lifetime; every attempt (first submit, reconciliation-driven fresh attempt, overlap rerun) is an
**immutable append** to the `provider_operation_attempts` child table (new `attempt_no`, new `attempt_key`).
On a permitted fresh attempt the parent row's *current-attempt* fields (`state`, `provider_job_id`,
`dispatch_key`) are updated in place to point at the new attempt (e.g. reset to `claimed → submitting`),
while all prior attempt rows are retained unchanged. Result: exactly **one** operation row per
`(provider_connection_id, cache_key)`, full attempt history preserved, no unique-index conflict ever.
R5·3's parenthetical "(a new operation row, new attempt key)" is **corrected to** "(same operation row, new
appended attempt row + attempt key)."

**R6·5 — Budget reservation: concrete schema + atomic reserve/release/reconcile, incl. the unknown case
(completes R5·6).** Add an additive `budget_reservations` table (TEXT-ULID), scoped to the live-spend model
of the real `budgets` table:

- Columns: `id TEXT PK` (ULID) · `owner_id TEXT` (the `budgets.owner_id`) · `job_id TEXT REFERENCES
  jobs(id)` · `provider_operation_id TEXT REFERENCES provider_operations(id)` · `reserved_cents INT NOT
  NULL` · `period_start DATE NOT NULL` (matches the budget period) · `state TEXT NOT NULL CHECK (state IN
  ('held','released','reconciled'))` · `created_at`/`updated_at`.
- **Atomic reserve** (single transaction, serialized on the owner's budget row):
  1. `SELECT … FROM budgets WHERE owner_id=? FOR UPDATE` (locks the owner's budget line).
  2. `committed = SUM(jobs.cost_cents) WHERE owner_id=? AND created_at >= period_start`.
  3. `held = SUM(reserved_cents) FROM budget_reservations WHERE owner_id=? AND period_start=? AND state='held'`.
  4. If `cap_cents > 0` and `committed + held + reservedMax > cap_cents` → **reject** (insert nothing; the
     operation is blocked before any claim/submit). `reservedMax` = the R5·6 conservative maximum across the
     eligible fallback chain.
  5. Else `INSERT` one `state='held'` row for `reservedMax`; commit.
- **Release** (`state='held' → 'released'`): on `preaccept_rejected`, on cancel, or on a
  reconciliation-confirmed no-job failure. Frees the held amount immediately.
- **Reconcile** (`state='held' → 'reconciled'`): on success, set the job's real `jobs.cost_cents`, then mark
  the reservation `reconciled`. **`reconciled` rows are excluded from the `held` sum** (step 3) so they do
  not double-count against the now-committed `jobs.cost_cents`.
- **While `submission_unknown` / `awaiting_reconciliation`:** the reservation **stays `held`** — never
  released — because the operation may in fact be running and will bill; releasing early could let
  concurrent spend exceed the cap. Only reconciliation moves it: `in_flight`→(eventual success)→`reconciled`
  to actual; confirmed-no-job→`released`.

**R6·6 — Exact parent/child transitions for overlap accept / rerun / cancel, and the accept artifact
(completes R5·7/§8).** The reviewed unit is a **child** `repair.range` window job (`parent_job_id` → the
chunked-repair parent job) sitting in `jobs.status='awaiting_approval'` after an overlap-SSIM failure; the
parent stays `running` while it waits. Each decision (idempotent on the child's current `attempt_key`):

| Decision | child transition | artifact / effect | parent transition |
|---|---|---|---|
| **accept** | `awaiting_approval → succeeded` | advances with the child's **locally composited `result_key`** of the reviewed attempt (the degraded-but-accepted composite — **never** the raw `provider_output_key`; ties to §4/round-4 item 4) | parent stays `running`; consumes that `result_key`; when all child windows are `succeeded`, parent `running → succeeded` |
| **rerun** | `awaiting_approval → running` | requires explicit cost confirmation + a passing R6·5 reservation + a **new appended attempt row** (new `attempt_key`) on the **same** operation (R6·4); re-submits that one window; idempotent — a rerun carrying an already-seen `attempt_key` dedups to the existing attempt and does **not** submit again | parent stays `running` |
| **cancel** | `awaiting_approval → canceled` (real enum spelling) | **release** the child's held reservation (R6·5) | a required window cannot complete ⇒ parent `running → canceled`; sibling in-flight children are canceled and their reservations released too |

"What accept advances with" is therefore explicit: the **composited `result_key`** of the attempt under
review. SSIM for the accept decision is computed on the composited regions, not raw provider frames
(unchanged from §8).

**Round-6 added tests** (beyond the `0032` §12 list, §9's seven, and round-5's seven): (a) a
`video.inpaint` request with no `operation` fails to type-check/validate under the `Exclude<Capability,
'video.inpaint'>` base arm, while all eight non-video-inpaint capabilities still validate; (b)
`manifestSatisfies` accepts/rejects fps purely by the four integer cross-multiply comparisons with no float
in the path; (c) a reconciliation that finds the job `in_flight` transitions the repair job
`awaiting_reconciliation → running` and enqueues a poll-only continuation that has no submit branch (assert
zero submits); a confirmed-no-job reconciliation goes `awaiting_reconciliation → failed`; (d) a fresh
attempt inserts a new `provider_operation_attempts` row under the **same** `(provider_connection_id,
cache_key)` operation with **no** unique-index violation; (e) two concurrent reserves on the same owner
serialize on the budget row and cannot jointly exceed `cap_cents`; a reservation stays `held` through
`submission_unknown` and only `released`/`reconciled` on reconciliation; (f) accept advances the parent with
the composited `result_key` (never `provider_output_key`); cancel of a required child transitions the
parent to `canceled` and releases sibling reservations; a duplicated rerun with a seen `attempt_key`
produces no second submit.

**What I did / did NOT do (round-6 append):** *Did* — verified `06`'s uncompressed-vs-compressed sizes on
disk (462,775 vs 195,431 — both correct; retracted my "transcription slip"); confirmed the on-disk
`CURRENT-STATUS`/handoff-32 placeholders are already filled and diagnosed why `07`'s in-ZIP copies were
stale; read `migrations/0001_schema.sql` to ground every transition in the real `jobs.status`/`budgets`
model; appended these six blocker resolutions + the two self-corrections. *Did NOT* — write or change any
code; add an FFmpeg string; run the probe; read the fal key; call any provider; upload media; spend
anything; rewrite `0032` or `0033`'s body (round-6 appended only); modify VHE-2 or the §7 `Capability`
union; re-run the suite (nothing changed — **153/153 · preflight 13/4/1**, HEAD `52e3277`). **Still NOT
build-authorized.** Next authorized action is packaging `VHE-Progress-update 08`; the probe still awaits
Ashley's separate explicit key/network go.

— `CC-OPUS-01` (Claude Opus 4.8), 2026-07-24

---

### Round-7 correction — Eli blockers on `VHE-Progress-update 09` (2026-07-24, `CC-OPUS-01`)

**Source:** Ashley relayed the reviewer ("Eli") verdict on `VHE-Progress-update 09`. Verdict:
**specification REJECTED — do not implement the removal lane.** Six remaining blockers, plus a required
definition of exact parent/child resume behavior across all seven job statuses. Instruction: append
round-7 to `0033` **only**; do not rewrite `0032` or any prior correction; update the logs/status files;
cut the next review ZIP; stop for a focused re-review. Nothing here authorizes any build, key read, probe,
network call, deployment, or spend.

Every resolution below is grounded against the **real code read this session** — `packages/jobs/worker.ts`,
`packages/jobs/create.ts`, `packages/jobs/errors.ts`, `packages/repair/chunked-repair.ts`,
`packages/providers/routing.ts`, `packages/providers/types.ts`, `packages/queue/runtime.ts`,
`migrations/0001_schema.sql` — with exact line citations so a builder (or the reviewer) can verify each
claim without trusting this prose. **The five blockers Eli raised are all real defects in my own round-5/
round-6 text, not misreadings.** I confirmed each against the source before writing a resolution.

**R7·0 — Baseline correction (my prior entries are stale on this).** Round-5, round-6, handoff 34 and
`CURRENT-STATUS` all state the baseline commit as `52e3277`. **The real HEAD is `cbc094e`** ("Track
Higgsfield teardown addon source doc"), committed after handoff 34 was written. That commit also
**resolves the long-standing Higgsfield addon decision** — the docx is now tracked, so the "untracked
pending an owner decision" note carried in `CURRENT-STATUS`/handoff 34/`0023` is obsolete. No source code
changed in it (one binary docx added), so the suite/preflight figures still stand as last measured.
Round-7's citations are against `cbc094e`. Working tree was clean at session start.

---

**R7·1 — `awaiting_reconciliation` is destroyed by the worker's unconditional `succeeded` write (fixes
R6·3).**

**Ground truth (`worker.ts:66-73`):** after the handler resolves, `executeClaimed` runs, with **no
condition of any kind**:

```
const result = await deps.handlers[row.type]!(row, …);
await deps.query(
  `UPDATE jobs SET status='succeeded', output=$2, progress=1, cost_cents=$3,
          provider_id=$4, updated_at=now() WHERE id=$1`, …);
deps.publishState(jobId, 'succeeded');
```

R6·3 specified that on an ambiguous submit "the worker does **not** throw … sets the repair job to
`jobs.status = 'awaiting_reconciliation'` … and returns." **Returning is precisely what triggers line 68.**
The handler's `awaiting_reconciliation` write is overwritten by `status='succeeded', progress=1`
microseconds later. R6·3 as written is not merely incomplete — it produces the **worst possible** outcome:
a job whose provider submission is of unknown status is reported to the operator and to the parent as
**succeeded**, with `progress=1` and no `result_key`; the budget reservation stays `held` forever (R6·5
only releases via reconciliation, which will never be invoked for a "succeeded" job); and a chunk parent
consuming that child's non-existent composited output advances the whole repair on nothing. Eli is
correct; R6·3's mechanism is retracted and replaced.

**Correction — the handler must be able to return a non-terminal disposition, and the terminal writes must
be guarded.** Three additive changes to the §4.2 seam (all `0016`/`0018`-class logged deviations when
built; the verbatim §4.2 skeleton is *extended*, and its existing success/failure semantics for every
current job type are unchanged):

1. **Discriminated handler outcome.** `JobHandler`'s return type (`worker.ts:24-28`) becomes a union:

```
type HandlerOutcome =
  | { disposition: 'completed'; output: unknown; costCents?: number; providerId?: string | null }
  | { disposition: 'parked'; status: 'awaiting_reconciliation' | 'awaiting_approval';
      output?: unknown; providerId?: string | null; noteCode?: ErrorCode };
```

An existing handler that returns the current `{ output, costCents?, providerId? }` shape is treated as
`disposition:'completed'` (defaulted at the seam), so **no currently-passing handler or test changes
behavior**.

2. **`executeClaimed` branches on the disposition.** Only `'completed'` may write `succeeded`. `'parked'`
writes the named non-terminal status, **never sets `progress=1`**, never publishes `succeeded`, and
returns normally (so BullMQ does not retry — preserving R6·3's actual invariant, which was correct; only
its mechanism was broken).

3. **Both terminal writes become guarded, single-winner updates.** The `succeeded` write gains
`AND status='running'`, and the `failed` write gains `AND status IN ('running','queued')`. Rationale: the
worker claimed the row *into* `running` (`worker.ts:37`), so `running` is the only state from which it is
entitled to write a terminal result. If a concurrent cancel, a reconciliation, or a parked write moved the
row, the guarded update affects **zero rows** and the worker **must not publish** the corresponding state
— it logs the lost race and returns. This is defense-in-depth: even if a future handler forgets the
disposition, a parked or canceled row can no longer be silently overwritten with `succeeded`.

4. **`publishState` must be widened** (`worker.ts:58`, and its two other declarations at
`queue/runtime.ts:39,51` and its call site `:69`) from `'succeeded' | 'failed'` to additionally carry
`'awaiting_approval' | 'awaiting_reconciliation'`. Without this the UI has no event for a parked job and
would show it as still running forever. Additive; the two existing values are unchanged.

---

**R7·2 — the poll-only continuation cannot claim a freshly-`running` job (fixes R6·3's resume path).**

**Ground truth (`worker.ts:35-45`), the verbatim §4.2 optimistic claim:**

```
UPDATE jobs SET status='running', attempt=attempt+1, heartbeat_at=now(), updated_at=now()
 WHERE id=$1
   AND status IN ('queued','running')   -- 'running' allows takeover after stall
   AND (status='queued' OR heartbeat_at < now() - interval '120 seconds')
 RETURNING *
```

R6·3's reconciliation table says: on "found accepted/running", transition the repair job
`awaiting_reconciliation → running` **and then** enqueue a poll-only continuation. When that continuation
is delivered, its worker calls `claimForExecution`. Three independent failures follow:

- The row is now `running` with a **recent `heartbeat_at`**, so `status='queued'` is false and
  `heartbeat_at < now() - interval '120 seconds'` is false ⇒ **zero rows** ⇒ the function returns `null`
  ⇒ per its own contract (`worker.ts:33-34`) "the caller drops silently." The continuation is **swallowed**
  and the job sits in `running` forever, reservation `held` forever. A permanent deadlock, and a silent one.
- `awaiting_reconciliation` is **not in the `status IN (…)` list at all**, so the alternative ordering
  (enqueue first, flip status later) cannot be claimed either.
- `attempt=attempt+1` fires on every claim, so each reconciliation resume burns one of the three attempts
  the retry ceiling at `worker.ts:76` (`row.attempt < 3`) allows. A resume is not a failed delivery and
  must not consume that budget.

**Correction — do not edit the verbatim §4.2 claim; add a separate, additive resume claim that performs
the state transition itself.**

```
-- additive; the verbatim claimForExecution above is untouched
UPDATE jobs SET status='running', heartbeat_at=now(), updated_at=now()
 WHERE id=$1 AND status='awaiting_reconciliation'
 RETURNING *
```

- **Reconciliation no longer flips the job status.** It records the provider finding on the operation row
  (`submission_unknown → in_flight`) and enqueues the continuation; the job **stays**
  `awaiting_reconciliation`. The continuation's own guarded claim is what performs
  `awaiting_reconciliation → running`, atomically and single-winner. This removes the race entirely rather
  than narrowing it — there is no window in which the row is `running` but unclaimed. R6·3's table is
  corrected accordingly: its "repair-job transition `awaiting_reconciliation → running`" is performed **by
  the resume claim**, not by the reconciliation endpoint.
- **`attempt` is NOT incremented** by the resume claim. A reconciliation resume is not a delivery attempt.
- The claim asserts the operation row's `provider_job_id` matches the one the continuation was enqueued
  with; on mismatch it **refuses to run** rather than polling a job id the row does not own.
- **Zero rows ⇒ another worker already owns the resume ⇒ drop silently** (same discipline as the verbatim
  claim).

**Closing the takeover hole.** Once the resumed job is `running`, the *verbatim* claim at `worker.ts:35-45`
can still take it over after a 120-second heartbeat stall — and that takeover would re-enter the **normal**
handler, which has a submit branch. That would resubmit a job whose provider operation is already
in flight: a duplicate paid submission, arriving by the one path R6·3 did not consider. **Therefore:**
reconciliation persists a durable `resumeMode: 'poll_only'` marker (plus the `provider_job_id`) into the
job's `input` JSONB **before** enqueueing. Handler dispatch reads that marker, so **any** worker that
later claims the row — including via the verbatim stale-takeover path — dispatches to the poll-only
execution mode, which structurally has no submit branch (R6·3). The guarantee becomes a property of the
persisted row, not of which code path happened to claim it.

---

**R7·3 — chunk parents automatically rerun children parked in `awaiting_approval` /
`awaiting_reconciliation` (fixes §8 / R5·7 / R6·6 on the parent side).**

**Ground truth (`chunked-repair.ts`):**

- `:123` — `export type ChildStatus = 'queued' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'canceled';`
  — **`awaiting_reconciliation` is absent**, so R6·3's new state cannot even be represented to the parent.
- `:126-131` — `firstNonSucceededWindow` selects `statusByIndex.get(window.index) !== 'succeeded'`, i.e.
  **anything that is not `succeeded`** is "the next unit of work."
- `:174-182` — `executeChunkedRepairPlan` skips only `=== 'succeeded'` and otherwise calls
  `await deps.run(window, windowChildInput(plan, window))`, then throws at `:180` if the result is not the
  literal `'succeeded'` (`run` is typed `Promise<'succeeded'>` at `:168`, so a parked child cannot even be
  expressed as a return value).

Consequence: a child window sitting in `awaiting_approval` — **deliberately waiting for Ashley's overlap
decision** (R6·6) — is selected by the parent as runnable and **re-executed**, producing a second paid
submission for a window whose entire purpose is to be waiting for a human. Identically for a child in
`awaiting_reconciliation` (an ambiguous submit that may already be billing — re-running it is exactly the
duplicate-charge this spec chain exists to prevent) and for `canceled` (a cancel is silently undone). This
flatly contradicts R6·6's "parent stays `running` while it waits." Eli is correct.

**Correction — replace the binary succeeded/not-succeeded rule with explicit status classification.**

1. **Add the missing state:** `ChildStatus` gains `'awaiting_reconciliation'` (matching the additive
   `jobs.status` CHECK value from R6·3).
2. **Introduce a disposition classifier**, and make it — not `!== 'succeeded'` — the thing the executor
   branches on:
   `type ChildDisposition = 'complete' | 'runnable' | 'in_flight' | 'blocked' | 'terminal_failure';`
3. **The hard invariant:** `executeChunkedRepairPlan` may call `deps.run` **only** for a child that is
   absent (never created) or `queued`. For every other status it skips, waits, or terminates the parent —
   it never re-executes.
4. `run`'s return type widens from `Promise<'succeeded'>` to `Promise<ChildStatus>`, and the loop
   re-classifies the returned status instead of throwing at `:180`, so a child that finishes *parked*
   halts the parent cleanly instead of raising.
5. `firstNonSucceededWindow`'s `!== 'succeeded'` rule is **retired for this lane** and replaced by
   `firstActionableWindow`, returning the window **and** its disposition. Impact is contained: the
   function is exported but its only call sites are its own tests (`chunked-repair.test.ts:11,86,88`),
   which are updated with it as a logged deviation when built.

**The exact parent/child resume behavior for all seven statuses** (this is the table Eli asked for; the
child is a `repair.range` window job whose `parent_job_id` is the chunked-repair parent):

| child `jobs.status` | disposition | what the parent does | may the parent cause a submit? |
|---|---|---|---|
| **`succeeded`** | `complete` | skip the window; consume its **composited `result_key`** (never `provider_output_key`, §4/R6·6); continue to the next window. When every window is `succeeded`, parent `running → succeeded` | **no** |
| **`queued`** | `runnable` | this window is the next unit of work. The parent does **not** create a second child — the deterministic `{parentJobId}:win:{index}` key (`chunked-repair.ts:115`) dedupes at `create.ts:148-161`. The child's own worker submits, exactly once | no — the child submits once, under its own claim |
| **`running`** | `in_flight` | **wait.** Never start a second execution of the same window. A stalled child is recovered by §4.2's own 120-second heartbeat takeover on that child row, **not** by a parent-issued rerun. Parent stays `running` | **no** |
| **`awaiting_approval`** | `blocked` (human) | **stop and wait.** Parent stays `running`. Surface the R6·6 accept / rerun / cancel decision to the operator. **Only an explicit operator `rerun` may restart this window** — never the parent, never a scheduler, never a restart | **no** |
| **`awaiting_reconciliation`** | `blocked` (system) | **stop and wait.** Parent stays `running`. Exit only via the R6·3 reconciliation endpoint (read-only provider query). The budget reservation stays `held` throughout (R6·5) | **no** |
| **`failed`** | `terminal_failure` | the parent does **not** silently retry. Parent `running → failed`, recording the failing window index and the child's `error_code`. A retry is an explicit operator action minting a new attempt on the same operation (R6·4/R6·6) | **no** |
| **`canceled`** | `terminal_failure` | a required window cannot complete ⇒ parent `running → canceled`; cancel in-flight sibling children; **release** this and every sibling's held reservation (R6·5/R7·5) | **no** |

**Restart safety:** because the classifier is driven entirely by persisted `jobs.status`, a parent worker
that dies and is re-delivered re-derives the identical decision from the database. No parked child is ever
re-run by a restart, which is the property `firstNonSucceededWindow` silently violated.

---

**R7·4 — the budget reservation is released while the fallback chain is still walking (fixes R6·5).**

**Ground truth:** R6·5's release rule reads "**Release** (`state='held' → 'released'`): on
`preaccept_rejected`, on cancel, or on a reconciliation-confirmed no-job failure." But R5·5 defines
`preaccept_rejected` as **the only variant permitted to fall through** to the next routing candidate, and
`walkChain` (`routing.ts:115-136`) continues its `for (const connection of chain)` loop after each failed
step. So the release fires **exactly** at the moment the walk advances to the next candidate.

Why that is a real defect: R5·6 chose the reserve-conservative-maximum-across-the-eligible-chain design
**specifically** so that a mid-chain fall-through to a *more expensive* provider is already covered.
Releasing at the first pre-accept rejection destroys that guarantee and reintroduces the exact TOCTOU
window R5·6 was chosen to close — between the release and the next candidate's submit, a concurrent job
can consume the freed headroom, and the later, costlier candidate then submits with **no coverage**,
letting committed spend exceed `cap_cents`. Eli is correct.

**Correction — the reservation's lifetime is the whole chain walk, not one candidate.**

- **One reservation per chain-walk attempt**, taken **before the first candidate**, sized `reservedMax` =
  the maximum estimate across **all** eligible candidates in the chain (R5·6, unchanged).
- **`preaccept_rejected` on candidate *k* does NOT touch the reservation.** The walk advances to *k+1*
  under the same held reservation. The per-candidate rejection is recorded on the attempt row and in
  `walkChain`'s existing `ChainFailure` trail (`routing.ts:94-100,123-128`).
- The reservation resolves **only at a terminal outcome of the walk**:

  | walk outcome | reservation |
  |---|---|
  | some candidate returns `accepted` | **stays `held`**, now bound to the accepted attempt; reconciled to actual on success (R7·5) |
  | chain **exhausted** — every candidate `preaccept_rejected` ⇒ `walkChain` throws `NO_PROVIDER` (`routing.ts:135`) | **`released`** — nothing was submitted anywhere |
  | any candidate returns `ambiguous` | the walk **stops immediately** (R5·5: never a fall-through) and the reservation **stays `held`** through `submission_unknown` / `awaiting_reconciliation` (R6·5, unchanged) |

- **R6·5's release list is corrected**: strike `preaccept_rejected`. The release triggers are exactly
  **(a)** chain exhausted with no acceptance, **(b)** cancel, **(c)** reconciliation-confirmed no-job.
- **Chain-snapshot invariant:** the eligible chain is snapshotted when `reservedMax` is computed, and the
  walk may **not** visit a candidate outside that snapshot. Without this, a manifest refresh mid-walk could
  introduce a candidate more expensive than anything the reservation was sized for.

---

**R7·5 — reservations and actual costs are not tied to individual attempts (fixes R6·5 / R6·4 / R6·6).**

**Ground truth:** R6·5's `budget_reservations` carries `job_id` and `provider_operation_id` and **no
attempt reference**. R6·4 established exactly **one** `provider_operations` row per
`(provider_connection_id, cache_key)` with **many** appended `provider_operation_attempts`. R6·6's rerun
mints a new attempt that must pass its own reservation. Meanwhile the real budget model computes spend
live from a **single scalar per job** — `SUM(jobs.cost_cents)` (`schema:104`, implemented at
`create.ts:59-67`).

Two distinct defects follow:

- **(a) Reservation ambiguity.** Two `held` rows for the same `provider_operation_id` — the original
  attempt and a rerun attempt — are **indistinguishable**. A release or reconcile targeted by
  `provider_operation_id` touches an arbitrary one, so either the wrong attempt's reservation is freed
  while its submission is live (cap can be exceeded), or a reservation is orphaned in `held` forever,
  permanently shrinking the owner's usable budget with no path to recover it.
- **(b) Cost overwrite.** R6·5's reconcile step says "set the job's real `jobs.cost_cents`." With N paid
  attempts on one job (original + reruns), a **SET overwrites**: attempt 1's real spend vanishes from
  `SUM(jobs.cost_cents)`, the owner is under-billed against their own cap, and the cap stops being
  enforceable at exactly the moment reruns make it matter most. `jobs.cost_cents` is one scalar, but this
  lane now has multiple billable attempts per job — a mismatch R6·5 never reconciled.

**Correction — make the attempt the unit of both reservation and cost.**

1. **`budget_reservations` gains `provider_operation_attempt_id TEXT NOT NULL REFERENCES
   provider_operation_attempts(id)`.** The grain of a reservation is **one attempt**, not one operation.
   `job_id` and `provider_operation_id` are retained as denormalized rollup/query handles only. Every
   release and reconcile targets **`provider_operation_attempt_id`** — never `provider_operation_id`.
2. **Ordering (this is what makes the FK satisfiable, and it corrects R6·5's implied order):** the attempt
   row is created **first**, in state `claimed` with no `provider_job_id` yet; the reservation is then taken
   **against that attempt id**; only then does the chain walk / submit run. R6·5's "before any durable claim
   or submit" still holds for the *reservation vs. submit* ordering — the attempt row insert now precedes
   both, and it is also what supplies the `attempt_key` the uniqueness in R7·6 keys on.
3. **Cost is per-attempt and authoritative on the attempt row.**
   `provider_operation_attempts.cost_cents` is the real billed amount for that attempt (`0` for attempts
   that never billed). **`jobs.cost_cents` becomes a derived rollup, never a blind SET** — recomputed
   inside the same transaction that flips the reservation to `reconciled`:

```
UPDATE jobs SET cost_cents = (
    SELECT COALESCE(SUM(a.cost_cents), 0)::int
      FROM provider_operation_attempts a
      JOIN provider_operations o ON o.id = a.provider_operation_id
     WHERE o.job_id = jobs.id),
  updated_at = now()
WHERE id = $1
```

   This deliberately leaves the **live-spend query and the `budgets` model completely unchanged** — no
   migration to the budget mechanism, `create.ts:59-67` and `schema:104` keep working verbatim, and
   `jobs.cost_cents` keeps its documented meaning ("what this job actually cost"), now correctly summed
   across attempts instead of overwritten by the last one.
4. **No double-counting in chunked repair.** The billable grain is the **child** `repair.range` job. Each
   child's `cost_cents` is the rollup of its own attempts; the **parent's `cost_cents` stays `0`**.
   Otherwise `SUM(jobs.cost_cents)` counts every window twice — once on the child, once on the parent —
   and silently halves the owner's effective cap. R6·5/R6·6 never stated this; stating it now.
5. `budget_reservations.reserved_cents` remains the R5·6 chain-maximum for that attempt's walk (R7·4);
   reconcile writes the attempt's actual, then marks the row `reconciled` (excluded from the `held` sum per
   R6·5 step 3, unchanged).

---

**R7·6 — no database-enforced uniqueness for rerun attempt keys or reservations (fixes R5·4 / R5·7 / R6·6).**

**Ground truth:** R5·7 promises a rerun carrying an already-seen `attempt_key` is "**deduplicated** to that
existing attempt … does **not** submit again," and R6·6 repeats it. But R5·4's
`provider_operation_attempts` definition specifies **no unique constraint on `attempt_key`**, and R6·5's
`budget_reservations` specifies none either. As written, both dedups are application-level
SELECT-then-INSERT — a textbook TOCTOU race: two concurrent rerun clicks both SELECT nothing, both INSERT,
both reserve, both submit ⇒ **two paid submissions**. The single guarantee this spec chain exists to
provide would be unenforced at the only layer that can actually enforce it.

The project already contains the correct, working pattern — `jobs.idempotency_key TEXT UNIQUE`
(`schema:64`) plus claim-on-insert `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING id` with a
`rowCount === 0` branch that returns the existing row and **does not enqueue** (`create.ts:100-110`,
mirrored for children at `:148-161`). §4.1's own words: "the idempotency claim happens at the API layer,
BEFORE anything is enqueued." Round-7 mirrors it exactly rather than inventing a second discipline.

**Correction — DB-enforced uniqueness, plus claim-on-insert at every spend-capable boundary.**

1. **Attempt-key uniqueness (global):**
   `CREATE UNIQUE INDEX provider_operation_attempts_attempt_key_uniq ON provider_operation_attempts (attempt_key);`
   The `attempt_key` is deterministic and derived from the operation id + decision context + window index,
   so it is collision-free across operations by construction. Additionally
   `CREATE UNIQUE INDEX provider_operation_attempts_no_uniq ON provider_operation_attempts (provider_operation_id, attempt_no);`
   so the appended history can never fork two rows at the same ordinal.
2. **Attempt creation is claim-on-insert:**
   `INSERT INTO provider_operation_attempts (…) VALUES (…) ON CONFLICT (attempt_key) DO NOTHING RETURNING id;`
   **`rowCount === 0` ⇒ a duplicate/concurrent rerun already owns this attempt ⇒ return the existing row,
   do NOT reserve, do NOT claim, do NOT submit.** This makes R5·7/R6·6's dedup structurally true instead of
   aspirational.
3. **One reservation per attempt, ever:**
   `CREATE UNIQUE INDEX budget_reservations_attempt_uniq ON budget_reservations (provider_operation_attempt_id);`
   inserted with `ON CONFLICT (provider_operation_attempt_id) DO NOTHING`; zero rows ⇒ already reserved ⇒
   do not reserve twice. **Deliberately a full unique index, not a partial one on `state='held'`** — a
   `released` row must still block a second reservation for the same attempt, otherwise a released attempt
   could be re-reserved and re-submitted, recreating the double-charge by a different route.
4. **Restate the load-bearing R6·4 index explicitly**, since everything above depends on it:
   `CREATE UNIQUE INDEX provider_operations_conn_cache_uniq ON provider_operations (provider_connection_id, cache_key);`
5. **The operator decision endpoint** (R5·7/R6·6) accepts a client-supplied deterministic decision key that
   maps 1:1 onto `attempt_key`, so a double-clicked "rerun" collapses **at the database**, not in
   application logic — the same guarantee `createJob` already gives every other action in the system.

**The ordered spend-capable sequence** (R7·5 + R7·6 as one transaction discipline; no step may be skipped
or reordered):

1. Mint the deterministic `attempt_key`.
2. `INSERT … ON CONFLICT (attempt_key) DO NOTHING RETURNING id` → **0 rows ⇒ return the existing attempt
   and STOP** (no reserve, no claim, no submit).
3. Reserve against that attempt id inside the R6·5 `SELECT … FROM budgets WHERE owner_id=? FOR UPDATE`
   transaction, `ON CONFLICT (provider_operation_attempt_id) DO NOTHING` → rejected by cap ⇒
   `BUDGET_EXCEEDED`, mark the attempt failed, **STOP**.
4. Claim the parent operation row (R5·4 guarded update) → 0 rows ⇒ another worker owns it ⇒ **STOP**.
5. Walk the chain and submit under that single held reservation (R7·4).
6. Terminal outcome ⇒ release or reconcile **by `provider_operation_attempt_id`** (R7·5), and recompute
   `jobs.cost_cents` as the attempt rollup in the same transaction.

---

**Round-7 added tests** (beyond `0032` §12, §9's seven, round-5's seven, and round-6's six):

1. A handler returning `disposition:'parked'` leaves `jobs.status='awaiting_reconciliation'` — assert the
   row is **not** `succeeded`, `progress` is **not** `1`, and no `succeeded` event was published.
2. The guarded terminal write affects zero rows when the job was concurrently moved out of `running`, and
   the worker publishes nothing (no `succeeded` over a canceled or parked row).
3. A poll-only continuation claims an `awaiting_reconciliation` job **with a fresh heartbeat** and wins;
   the verbatim `claimForExecution` on that same row returns `null`; `attempt` is unchanged after the
   resume claim.
4. A worker taking over a stalled resumed job via the **verbatim** 120-second path reads
   `resumeMode:'poll_only'` from `input` and dispatches to the poll-only handler — assert **zero** submits.
5. For each of the seven child statuses, the parent takes exactly the tabled action; specifically
   `deps.run` is invoked **only** for `queued`/absent children, and a parent restart with a child in
   `awaiting_approval` or `awaiting_reconciliation` issues **zero** submissions.
6. A `preaccept_rejected` on candidate 1 of 3 leaves the reservation `held` and the walk continues; the
   reservation is `released` only when the chain is exhausted with `NO_PROVIDER`; an `ambiguous` result
   stops the walk with the reservation still `held`.
7. Two concurrent reruns with the same `attempt_key` produce exactly **one** attempt row, **one**
   reservation row, and **one** submit (DB-enforced, not app-enforced); the loser returns the existing
   attempt.
8. A job with three billed attempts has `jobs.cost_cents` equal to the **sum** of the attempts (not the
   last one), and a chunked parent's own `cost_cents` is `0` while its children carry the spend — assert
   `SUM(jobs.cost_cents)` for the owner counts each window exactly once.

---

**Status after round 7:** `0032` (base) + `0033` (binding + round-5 + round-6 + **round-7**) remain the
removal-lane spec. **STILL NOT build-authorized** — awaiting Eli's focused re-review of the round-7
resolutions on `VHE-Progress-update 10`. The fal zero-spend probe remains **separately gated on Ashley's
explicit in-person key/network authorization**; reviewer clearance does not substitute for it (R5·0,
unchanged).

**What I did / did NOT do (round-7 append):** *Did* — read `0032` and `0033` in full; read
`packages/jobs/worker.ts`, `packages/jobs/create.ts`, `packages/jobs/errors.ts`,
`packages/repair/chunked-repair.ts`, `packages/providers/routing.ts`, `packages/providers/types.ts`,
`packages/queue/runtime.ts` and `migrations/0001_schema.sql` at `cbc094e` to verify each of Eli's six
blockers against real code before writing a resolution (all six are genuine defects in my own round-5/
round-6 text); confirmed via `git log`/`git status` that HEAD is `cbc094e`, not the `52e3277` my prior
entries cite, and that the Higgsfield docx is now tracked; grepped the call sites of
`firstNonSucceededWindow`/`publishState`/`executeChunkedRepairPlan` so the blast radius stated above is
measured, not assumed; appended these six resolutions, the seven-status parent/child resume table, and
eight tests. *Did NOT* — write or change any code; add an FFmpeg string; run the probe; read the fal key;
call any provider; touch the network; upload media; spend anything; rewrite `0032` or `0033`'s body or any
prior appended correction (round-7 appended only); modify VHE-2 or the §7 `Capability` union; re-run the
suite (no source touched — figures remain **153/153 · preflight 13/4/1**, last measured at `52e3277`;
`cbc094e` added only a binary docx).

— `CC-OPUS-01` (Claude Opus 5), 2026-07-24

---

### Round-8 correction — Eli blockers on `VHE-Progress-update 10` (2026-07-24, `CC-OPUS-01`)

**Source:** Ashley relayed the reviewer ("Eli") verdict on `VHE-Progress-update 10`, then left for the
day; this append was produced autonomously under her standing instructions and Eli's explicit
directives. **Package audit: PASS** — Eli independently confirmed 155 entries, 970,159 compressed bytes,
SHA-256 `165E9B7473DFEF75999C3E96B30A9563D0BC7142B48F3F371FE30EACA34B2CBB`, ZIP integrity, no `.env`,
`.env.example` credential-free, zero backslash/duplicate/absolute/traversal/symlink paths, no
`_IN-PROGRESS` scratch, no `library/tools` leak, eight stripped binaries correctly recorded in the
package-10 manifest, and rounds 5/6/7 present and intact. Eli noted — correctly — that the repository
HEAD cannot be independently authenticated from a ZIP lacking `.git` metadata, and classified that as
**not** a packaging failure (see R8·7).

**Verdict: specification REJECTED with six remaining blockers.** Round 7 "substantially improves the
design" but is not implementation-safe. Instruction: append round 8 to `0033` **only**; do not rewrite
`0032` or any previous appendix; update logs/status/handoff; then make **one** docs-only commit
containing the completed correction set; cut `Progress-update 11`; stop for focused review.

**I assessed all six against the real code before writing. All six are correct, and four of them force
me to retract or structurally rework round-7 text that I wrote.** Those retractions are stated
explicitly below rather than quietly patched — round 7 is preserved above exactly as filed, and this
append governs where they conflict.

---

**R8·1 — The parked write is unguarded (fixes R7·1).**

**Correct, and it is my omission.** R7·1 guarded the `succeeded` write (`AND status='running'`) and the
`failed` write (`AND status IN ('running','queued')`) but never stated a guard for the **new** `parked`
update it introduced — leaving exactly the hole the guards existed to close. A concurrent cancel moves
the job to `canceled`; the unguarded parked write then overwrites it with `awaiting_reconciliation` or
`awaiting_approval`, resurrecting a canceled job into a non-terminal state that holds a budget
reservation indefinitely.

**Correction — one uniform guarded-write discipline for every disposition, no exceptions:**

```
UPDATE jobs SET status = $2, … , updated_at = now()
 WHERE id = $1 AND status = 'running'
 RETURNING id
```

- Applies to **all three** dispositions — `succeeded`, `failed`, **and** `parked`
  (`awaiting_reconciliation` / `awaiting_approval`).
- **Publish only when exactly one row was returned.** Zero rows ⇒ a concurrent transition won ⇒ the
  worker publishes **nothing**, logs the lost race, and returns. This is now stated once and applies
  uniformly, rather than per-write as in R7·1.
- **This also narrows R7·1's `failed` guard from `status IN ('running','queued')` to `status='running'`.**
  R7·1's wider predicate was over-permissive: a `queued` row is by definition one this worker does not
  own (it never claimed it into `running`), so writing a terminal failure onto it was never legitimate.
  The `0017` graceful-handback-to-`queued` path is unaffected — that path re-throws at `worker.ts:76`
  and never reaches the terminal write.

---

**R8·2 — `resumeMode:'poll_only'` is sticky across later attempts (fixes R7·2).**

**Correct, and this one is a real latent duplicate-submission-*prevention* failure — the mirror image of
the bug R7·2 was fixing.** R7·2 persisted the marker in `jobs.input` but never defined when it is
cleared. The failing sequence is concrete and reachable:

1. ambiguous submit ⇒ `awaiting_reconciliation`, `input.resumeMode='poll_only'` persisted;
2. reconciliation finds the job ⇒ resumed poll-only ⇒ result downloaded and composited;
3. overlap SSIM fails ⇒ child parks in `awaiting_approval`;
4. operator issues an explicit **rerun** ⇒ a fresh attempt that **must submit** —
5. but `input.resumeMode` is still `'poll_only'`, so the worker dispatches to the poll-only mode and
   **polls the previous provider job id** instead of submitting the new attempt. The rerun silently
   returns the stale result, or hangs.

**Correction — retract the `jobs.input` marker; bind execution mode and provider job id to the current
attempt.** R7·2's `resumeMode:'poll_only'` persisted in `jobs.input` is **withdrawn in full.**

- `provider_operations` gains **`current_attempt_id TEXT NULL REFERENCES provider_operation_attempts(id)`**.
- `provider_operation_attempts` gains **`execution_mode TEXT NOT NULL CHECK (execution_mode IN
  ('submit','poll_only'))`** and continues to carry its own `provider_job_id`.
- **Execution mode is derived, never stored on the job:** a worker resolves its mode by reading the
  operation's `current_attempt_id` and that attempt's `execution_mode` + `provider_job_id`. There is no
  job-level mode flag to go stale.
- **A fresh attempt atomically replaces all prior poll-only state.** In the same transaction that
  appends the new attempt (`execution_mode='submit'`, `provider_job_id` NULL), `current_attempt_id` is
  repointed to it. Because mode and job id are read *through* `current_attempt_id`, that single pointer
  write clears every trace of the previous poll-only attempt by construction — no separate clear step
  that could be forgotten or interrupted.
- **The R7·2 takeover guarantee is preserved and in fact strengthened:** any worker that claims the row
  — including via the verbatim 120-second stale-takeover path at `worker.ts:35-45` — resolves its mode
  from the durable attempt row, so a poll-only continuation still structurally cannot submit, and a
  rerun attempt still structurally cannot be diverted into polling.
- **Invariant:** a job may not return to an executable status while `current_attempt_id` points at an
  attempt whose `execution_mode` does not match the work about to be performed.

---

**R8·3 — A chain-wide reservation cannot belong to one provider-specific attempt (fixes R7·4/R7·5/R7·6).**

**Correct, and this is the genuine structural defect in round 7.** `provider_operations` is scoped
`(provider_connection_id, cache_key)` (R6·4), so **every** `provider_operation_attempts` row is
provider-specific by construction. But R7·5/R7·6 mandated the order: create one attempt → reserve
against that attempt → *then* walk a fallback chain that may be accepted by a **different** connection.
Before the walk runs there is no way to know which provider-specific operation should own a
**chain-wide** reservation. If candidate 1 pre-accept-rejects and candidate 2 accepts, the reservation
is FK-bound to candidate 1's attempt — an attempt that never submitted and never will. The reservation
would be attached to a falsehood. Round 7's ordering is unimplementable as written; I am retracting it.

**Correction — introduce a provider-neutral routing/chain attempt identity that owns the reservation.**

- **New additive table `routing_attempts`** (TEXT-ULID, provider-neutral — this is the missing identity):
  - `id TEXT PRIMARY KEY` (ULID)
  - `job_id TEXT NOT NULL REFERENCES jobs(id)` · `owner_id TEXT NOT NULL`
  - `routing_attempt_key TEXT NOT NULL` — the deterministic idempotency key for **this authorized walk**
    (what a rerun decision mints; see R8·6)
  - `chain_snapshot JSONB NOT NULL` — the ordered eligible `provider_connection_id` list captured when
    `reservedMax` was computed (enforces R7·4's chain-snapshot invariant)
  - `reserved_max_cents INT NOT NULL`
  - `state TEXT NOT NULL CHECK (state IN ('reserved','walking','accepted','exhausted','abandoned'))`
  - `accepted_attempt_id TEXT NULL REFERENCES provider_operation_attempts(id)` — written **after**
    selection, never before
  - `created_at` / `updated_at`
- **`budget_reservations` is re-pointed:** `routing_attempt_id TEXT NOT NULL REFERENCES
  routing_attempts(id)` (**UNIQUE** — one reservation per authorized walk). R7·5's
  `provider_operation_attempt_id NOT NULL` FK is **retracted**; it becomes
  `accepted_provider_operation_attempt_id TEXT NULL`, recorded only once a candidate accepts. **The
  reservation no longer requires a non-null provider-attempt FK before the winning candidate exists**,
  which was Eli's exact requirement.
- **Each candidate still gets its own provider-specific attempt** as the walk reaches it:
  `provider_operation_attempts` gains `routing_attempt_id TEXT NOT NULL REFERENCES routing_attempts(id)`,
  so every candidate attempt traces to the single walk that authorized and funded it, and the full
  per-candidate audit trail (R5·4) is preserved.
- **Corrected ordering** (superseding R7·6's six-step sequence, which is retracted in favor of this):
  1. mint the deterministic `routing_attempt_key`;
  2. insert the `routing_attempts` row (claim-on-insert, R8·6);
  3. compute `reservedMax` over the snapshotted chain and reserve **against the routing attempt**;
  4. walk the chain — each candidate gets its own `provider_operations` (upsert on
     `(provider_connection_id, cache_key)`) + a new `provider_operation_attempts` row FK'd to the
     routing attempt, and its own operation claim;
  5. on acceptance, set `routing_attempts.accepted_attempt_id` and
     `budget_reservations.accepted_provider_operation_attempt_id`, and mark the routing attempt
     `accepted`;
  6. resolve the reservation per R8·4.
- A candidate whose **operation claim** fails (another worker owns that operation) is treated as a
  candidate-level skip: the walk advances to the next candidate under the same reservation. It is
  **not** the R8·5 orphan case — the routing attempt and reservation remain live and owned.

---

**R8·4 — Cancel and post-acceptance failure must not auto-release (fixes R7·4/R6·5).**

**Correct.** R7·4 still listed cancel as a full-release condition, and R6·5 released on a
reconciliation-confirmed failure. Once a provider has **accepted** a job, neither a cancel nor a
subsequent provider-side failure proves the provider charged nothing — many providers bill accepted work
that is later canceled or fails mid-render. Fully releasing in those cases **erases real spend** from
the cap, which is the same class of failure as R7·5's cost overwrite.

**Correction — resolution is decided by whether acceptance was ever proven, not by the outcome label:**

| situation | reservation resolution |
|---|---|
| **proven pre-acceptance rejection** (R5·5 `preaccept_rejected`) on **every** candidate ⇒ chain exhausted | **release** — nothing was ever accepted anywhere |
| reconciliation **confirms no job was ever created** | **release** |
| **accepted** and succeeded | **reconcile** to the actual charge |
| **accepted** then **failed** provider-side | **reconcile** to the actual/provider-reported charge — **never release** |
| **canceled after acceptance** (operator cancel, or parent sibling-cancel) | **reconcile** to the actual/provider-reported charge — **never release** |
| **ambiguous** (`submission_unknown` / `awaiting_reconciliation`) | stays **`held`** (unchanged from R6·5) |
| **cost still unknown** in any of the reconcile rows above | stays **`held`** until billing reconciliation completes |

- Cost source of truth, in order: **provider-reported actual** → else the `0024` **versioned cost
  catalog** authoritative figure → else the reservation **stays `held`**. A reservation is never
  reconciled to a guess, and never released to hide an unknown.
- `budget_reservations` gains **`actual_cents INT NULL`** (written on reconcile) and
  **`billing_reconciled_at TIMESTAMPTZ NULL`**. `held` continues to count fully against the cap, so an
  unknown cost is treated conservatively rather than optimistically — the deliberate choice.
- **R6·5's release-on-cancel and R7·4's release-on-cancel are both retracted** and replaced by this
  table.
- **The parent sibling-cancel path (R6·6/R7·3) follows the same distinction:** canceling sibling
  children releases the reservations of siblings that were **never accepted**, and **reconciles** those
  that were. R6·6's blanket "release reservations" for the cancel row is corrected accordingly.

---

**R8·5 — The unchanged monthly budget query loses cross-period rerun spend (fixes R7·5).**

**Correct, and it retracts my round-7 claim.** R7·5 asserted that making `jobs.cost_cents` a derived
rollup meant "the real budget model needs **no** migration." That was wrong, and Eli's counterexample is
exact. Ground truth — `periodSpendCents` (`create.ts:56-68`):

```
SELECT COALESCE(SUM(cost_cents), 0)::int FROM jobs
 WHERE owner_id = $1
   AND created_at >= (SELECT COALESCE((SELECT period_start FROM budgets WHERE owner_id = $1),
                                       date_trunc('month', now())::date))
```

A job **created** on 31 January that receives a new paid attempt on 3 February: updating that job's
`cost_cents` does not count toward February, because the filter is on the **job's** `created_at`, which
is in January. And once the February reservation flips to `reconciled` it leaves the `held` sum — so the
February spend **disappears from February's cap** entirely. The cap silently under-counts exactly the
multi-attempt jobs this lane creates.

**Correction — the reservation ledger becomes the authoritative period ledger; `jobs.cost_cents` is
demoted.**

- `budget_reservations.period_start` is the period in force **when the reservation is taken** (i.e. when
  the spend is authorized), **not** the owning job's creation period. This is the field that makes
  cross-period attempts land in the right month.
- **Authoritative committed spend for the R6·5 reserve transaction:**

```
committed = (SELECT COALESCE(SUM(actual_cents),0)::int FROM budget_reservations
              WHERE owner_id=$1 AND period_start=$2 AND state='reconciled')
          + (SELECT COALESCE(SUM(j.cost_cents),0)::int FROM jobs j
              WHERE j.owner_id=$1 AND j.created_at >= $2
                AND NOT EXISTS (SELECT 1 FROM budget_reservations r WHERE r.job_id = j.id))
held      = (SELECT COALESCE(SUM(reserved_cents),0)::int FROM budget_reservations
              WHERE owner_id=$1 AND period_start=$2 AND state='held')
```

  The second term is the **legacy/no-reservation fallback**: jobs that predate this lane, or any
  single-shot job that never took a reservation, still count exactly once. The `NOT EXISTS` guard is
  what prevents double-counting a job that has both a `cost_cents` rollup and reservation rows — a trap
  a naive union would walk straight into.
- **`jobs.cost_cents` is explicitly demoted to a display rollup** (R7·5's rollup formula is retained
  *for display*) and is **no longer** the authoritative monthly ledger for multi-attempt jobs.
  R7·5's "needs no migration" sentence is **retracted**.
- **`create.ts`'s `periodSpendCents` must be replaced** by the query above, for **all** job types — it
  is the shared §4.1 pre-claim budget gate, not a removal-lane-only path. This is a change to an
  existing verbatim §4.1 function and is an additive, logged `0016`/`0018`-class deviation **to be
  logged when built**; it must be covered by a regression test proving single-attempt, no-reservation
  jobs gate identically to today.

---

**R8·6 — A failed operation claim can orphan a held reservation (fixes R7·6).**

**Correct.** R7·6 step 4 said "operation claim returns zero rows ⇒ **STOP**", but steps 2–3 had already
created the attempt and acquired the reservation, with no rollback, release, or terminal attempt
transition defined. That leaves a permanently `held` reservation for an attempt that never submitted —
each occurrence permanently shrinking the owner's usable cap with no recovery path.

**Correction — one DB-only transaction, plus a compensation path, plus a reaper for the residual window.**

1. **Steps 1–4 of the R8·3 ordering execute inside a single database transaction** and are **entirely
   DB-local — no network call inside it.** This matters: the transaction holds
   `SELECT … FROM budgets WHERE owner_id=? FOR UPDATE` (R6·5), and holding that lock across a provider
   HTTP submit would serialize every job for that owner behind one network round-trip. The **submit is
   deliberately outside** the transaction.
2. **Any failure inside the transaction — including the operation claim affecting zero rows — rolls the
   whole thing back.** The routing attempt, the attempt row, and the reservation all vanish together.
   There is no partial state to compensate for. This is the primary mechanism.
3. **Explicit compensation for every post-commit exit.** Because the submit happens after commit, any
   exit between commit and a durably-recorded submission outcome must compensate: mark the routing
   attempt `abandoned`, transition the attempt row terminal, and **release** the reservation — which is
   correct here precisely because no acceptance was ever proven (R8·4). **Invariant: there is no exit
   path after reservation acquisition without a defined compensation.**
4. **A reaper closes the crash window**, which no transaction can cover: a process that dies between
   commit and submit leaves a committed `held` reservation with no live owner. A scheduled sweeper marks
   `routing_attempts` still in `reserved`/`walking` past a configured lease deadline (with no accepted
   attempt and no in-flight provider operation) as `abandoned` and releases their reservations. Before
   releasing, it applies the **R8·4 test** — it must confirm no candidate reached `accepted` or
   `submission_unknown`; if any did, the reservation stays `held` for billing reconciliation instead of
   being released. The sweeper is idempotent and safe to run concurrently.
5. **Idempotency moves up to the routing attempt** (superseding R7·6's per-provider-attempt keying,
   which R8·3 made incoherent):
   - `CREATE UNIQUE INDEX routing_attempts_key_uniq ON routing_attempts (routing_attempt_key);`
   - insert via `INSERT … ON CONFLICT (routing_attempt_key) DO NOTHING RETURNING id`; **zero rows ⇒ a
     duplicate/concurrent decision already owns this walk ⇒ return the existing routing attempt, do NOT
     reserve, do NOT walk, do NOT submit.** This is what makes a double-clicked rerun collapse **at the
     database**, mirroring `jobs.idempotency_key` (`schema:64`, `create.ts:100-110`).
   - `CREATE UNIQUE INDEX budget_reservations_routing_uniq ON budget_reservations (routing_attempt_id);`
     — **full**, not partial: a `released` row must still block a second reservation for the same walk
     (R7·6's reasoning, re-pointed at the routing attempt).
   - `CREATE UNIQUE INDEX provider_operation_attempts_per_candidate_uniq ON provider_operation_attempts
     (routing_attempt_id, provider_operation_id);` — at most **one** attempt per candidate per walk, so
     a retried walk step cannot double-submit to the same provider.
   - R7·6's `provider_operation_attempts (attempt_key)` and `(provider_operation_id, attempt_no)` unique
     indexes are **retained**; `attempt_key` is now derived from `routing_attempt_key` +
     `provider_connection_id`, keeping it deterministic and collision-free.
   - The R6·4 index `provider_operations (provider_connection_id, cache_key)` is unchanged.

---

**R8·7 — Package provenance (response to Eli's HEAD-authentication note).**

Eli is right that a ZIP without `.git` cannot authenticate the repository HEAD, and right that this is
not a packaging failure. Starting with `Progress-update 11`, each package includes a generated
**`PACKAGE-PROVENANCE.md`** recording, at build time: `git rev-parse HEAD`, the one-line commit summary,
`git status --short` (so uncommitted working-tree state is disclosed rather than implied), the file
counts, and the exact inclusion/exclusion rule applied. **This remains self-asserted** — it is a
build-time record, not a cryptographic proof, and it is labeled as such inside the file. Independent
verification would require shipping `.git` metadata, which would defeat the lean-package purpose; not
proposing that unless Ashley or Eli asks.

---

**Round-8 added tests** (beyond `0032` §12, §9's seven, round-5's seven, round-6's six, round-7's eight):

1. A concurrent cancel lands between claim and the parked write: the guarded parked update affects
   **zero** rows, the job stays `canceled`, and **no** state is published.
2. After an ambiguous attempt is reconciled and the child later parks in `awaiting_approval`, an
   explicit rerun's fresh attempt has `execution_mode='submit'`, `current_attempt_id` points at it, and
   the worker **submits** rather than polling the previous `provider_job_id`.
3. A chain walk where candidate 1 `preaccept_rejected` and candidate 2 `accepted` produces **one**
   routing attempt, **one** reservation (never null-FK'd to candidate 1), **two** provider attempts, and
   `accepted_attempt_id` pointing at candidate 2's.
4. A cancel **after** acceptance **reconciles** (never releases) the reservation; a cancel **before** any
   acceptance releases it; a parent sibling-cancel applies both rules per sibling correctly.
5. A job created in period N-1 receiving a paid attempt in period N has that spend counted in **period
   N**'s cap; a legacy job with `cost_cents` and no reservation row is counted **exactly once**; a job
   with both is not double-counted.
6. An operation claim returning zero rows inside the transaction rolls back the routing attempt, the
   attempt row, and the reservation together — assert **no** `held` row survives.
7. A simulated crash between commit and submit leaves a `held` reservation that the reaper releases;
   the same scenario with a candidate in `submission_unknown` leaves it **`held`** (not released).
8. Two concurrent reruns with the same `routing_attempt_key` produce exactly one routing attempt, one
   reservation, and one submit — DB-enforced; the loser returns the existing routing attempt.

---

**Status after round 8:** `0032` (base) + `0033` (binding + rounds 5–8) remain the removal-lane spec.
**STILL NOT build-authorized** — awaiting Eli's focused re-review of `VHE-Progress-update 11`. Per Eli's
round-8 ruling: **if round 8 clears, the exact next gate is the separately authorized zero-spend fal
metadata probe — not removal-lane implementation.** The probe remains gated on Ashley's live, in-person
key/network authorization.

**Administrative rulings recorded (Eli, round 8):** continue signing `CC-OPUS-01`, recording "Claude Opus
5" as the current model version in the **existing** registry entry — **no `CC-OPUS-02` split** (the
open question raised in round 7 and in the registry note is hereby **closed**); make **one** docs-only
commit containing the completed correction set *after* the logs/status/handoff are updated; cut
`Progress-update 11` and stop.

**What I did / did NOT do (round-8 append):** *Did* — re-read `packages/jobs/create.ts`,
`packages/jobs/worker.ts`, `packages/providers/routing.ts` and `migrations/0001_schema.sql` to verify
each blocker before resolving it; confirmed all six are correct; **explicitly retracted four pieces of my
own round-7 text** (R7·2's `jobs.input` resume marker; R7·5's "budget model needs no migration"; R7·5/
R7·6's attempt-first reservation ordering; R7·4/R6·5's release-on-cancel), leaving round 7 above intact
as filed and letting this append govern; introduced `routing_attempts` as the provider-neutral
reservation owner; specified the transaction/compensation/reaper triple; added eight tests; recorded the
administrative rulings. *Did NOT* — write or change any code; add an FFmpeg string; run the probe; read
the fal key; call any provider; touch the network; upload media; spend anything; rewrite `0032` or
`0033`'s body or any prior appendix (round-8 appended only); modify VHE-2 or the §7 `Capability` union;
re-run the suite (no source touched — figures remain **153/153 · preflight 13/4/1**, last measured at
`52e3277`; no code has changed since).

— `CC-OPUS-01` (Claude Opus 5), 2026-07-24

---

### Round-9 correction — Eli blockers on `VHE-Progress-update 11` (2026-07-24, `CC-OPUS-01`)

**Source:** Ashley relayed the reviewer ("Eli") round-nine verdict on `VHE-Progress-update 11`.
**Package audit: PASS** — independently confirmed: 157 entries, 986,142 bytes, SHA-256
`204771A8517FE58A63BF1FEAB26CF08216602F5E2A16C3768B3CCF3AA58D4E7C`, ZIP integrity, no real `.env`, no
invalid/duplicate/absolute/traversal/backslash/symlink paths, no scratch file, no `library/tools` leak,
all eight stripped binaries correctly listed, **`0033` verified append-only with Update 10's complete
`0033` an exact prefix**, **`0032` byte-for-byte unchanged**, and **no source files changed between
Updates 10 and 11**.

**Verdict: specification REJECTED with five remaining blockers.** Instruction: append round 9 to `0033`
**only**; do not rewrite `0032`, `0033`'s body, or rounds 5–8; update logs/status/handoff; cut
`Progress-update 12`; make no further commit until the round-nine correction set is complete; stop.
**Explicit gate direction: the next gate is round-nine specification review, NOT the fal metadata probe.
The probe becomes next only after the complete specification is approved.**

**All five blockers are correct. Two of them are self-contradictions I introduced in round 8**, and one
of those reintroduced the exact fallacy this whole spec chain exists to eliminate. Rounds 5–8 are
preserved above as filed; round 9 governs where they conflict.

**R9·0 — Provenance wording correction (my error).** Eli is right: `.env.example` is credential-free but
it is **not** "all-empty," as my round-7/round-8 build scripts, `PACKAGE-PROVENANCE.md`, and
`CURRENT-STATUS` all claimed. It contains two **non-secret configuration defaults** —
`S3_REGION=auto` and `VHE_REPAIR_MEMORY_CEILING_BYTES=4294967296`. I read the file before allowing it
into the package and then described it inaccurately. **Corrected standing wording, used from
`Progress-update 12` onward:** "all credential-bearing values are empty; safe non-secret configuration
defaults are permitted." The packaging safety check itself was and remains correct — it aborts on any
`.env` variant other than `.env.example`.

---

**R9·1 — Operation-claim behavior contradicts itself, and a claim miss is not a candidate failure
(fixes R8·3 / R8·6).**

**Correct, and it is a flat self-contradiction.** For the single event "the operation claim affects zero
rows," R8·3's step 6 said *"a candidate-level skip: the walk advances to the next candidate under the
same reservation,"* while R8·6's step 2 said the whole transaction *"rolls back — the routing attempt,
the attempt row, and the reservation all vanish together."* Both cannot govern. Worse, **both are wrong**,
because a claim miss carries no information about whether the candidate is usable: it means only that
another worker currently owns the `(provider_connection_id, cache_key)` operation row. Skipping to
another provider on that signal **creates a second paid operation for work already in progress** — the
precise failure mode rounds 5–8 were built to prevent.

**Correction — a claim miss branches on the existing operation's state; it never auto-skips.**

| existing `provider_operations.state` | action | fall through to next candidate? |
|---|---|---|
| `succeeded` | **reuse** the stored `result_key` — zero provider calls (the R6·3/§3 cache-hit path) | no |
| `submitting` / `in_flight` | **attach and wait** — poll the recorded `provider_job_id` under the owning routing attempt; never a second submit | **no** |
| `submission_unknown` | **park for reconciliation** (R6·3 / R8·2); zero submits while indeterminate | **no** |
| `failed` | apply the **explicitly permitted retry rule** (R6·4: same operation row, new appended attempt); never a silent skip | no |
| `claimed` held by a live worker | wait for the lease, then re-evaluate against this same table | no |

**Correction — the transaction model is restructured into the three scopes Eli specified**, replacing
R8·6's single "steps 1–4 in one transaction":

1. **TX-A (once per walk):** claim the `routing_attempts` row (claim-on-insert on `routing_attempt_key`)
   and take the chain reservation. Commits before any candidate work.
2. **TX-B (one short transaction per candidate):** operation lookup/upsert on
   `(provider_connection_id, cache_key)`, attempt-row insertion, and the operation claim.
3. **Rollback scope on a lost claim is TX-B only — that candidate's newly inserted attempt row.** The
   routing attempt and the chain reservation **survive** and remain owned. R8·6's "roll the routing
   attempt and reservation back" is **retracted** for this event; it applies only to a failure *within*
   TX-A.

**Reservation handling for the two zero-spend outcomes** (Eli asked for these explicitly; neither was
previously defined):

- **Zero-spend cache reuse** (`succeeded` → reuse `result_key`): no provider call occurs and none will,
  so the chain reservation is **`released`** in full. This is a *proven* zero-spend outcome — it is one
  of the few cases where release is unambiguously correct under R8·4.
- **Attachment to an already-running operation** (`submitting` / `in_flight` / `submission_unknown`):
  this job's own chain reservation is **`released`**, because the **owning** routing attempt already
  holds a reservation covering that operation's charge, and the operation bills exactly once. Holding
  both would double-count against the cap. The attaching job records the operation it attached to; its
  eventual cost attribution reads through that operation's owning reservation rather than creating a
  second one. **Invariant: exactly one held reservation per billable provider operation, owned by the
  routing attempt that created it.**

---

**R9·2 — Compensation and the reaper can still erase an ambiguous submission (fixes R8·6).**

**Correct, and this is the most serious of the five: I reintroduced the exact fallacy the chain exists to
kill.** R8·6 said any post-commit exit before a durably recorded submission outcome may abandon the
routing attempt and release the reservation *"because acceptance was never proven."* Rounds 5 and 6
established the opposite as binding (R5·5, R6·5): **a timeout, dropped connection, generic 5xx, or
process crash after transmission is never proof of non-acceptance.** R8·6 quietly re-derived
"not proven accepted" as "proven not accepted." Eli also correctly observes that R8·6's reaper guards
`accepted` and `submission_unknown` but **not `submitting`** — which is precisely the state a process
leaves behind when it dies between sending the request and recording the response.

**Correction — a durable pre-submission boundary, with the abandon/release right narrowed to one state.**
`provider_operation_attempts` carries an explicit submission-boundary state:

| state | meaning | may be abandoned + released? |
|---|---|---|
| **`prepared`** | row committed; **no provider request has begun** — not a byte transmitted | **yes** — the only state that may |
| **`submitting`** | transmission may have begun | **no** — a crash here resolves to `submission_unknown` |
| **`accepted` / `in_flight`** | provider job id durably captured | no — reconcile |
| ambiguous (`submission_unknown`) | acceptance indeterminate | no — stays `held` until reconciliation |
| failed-after-acceptance / canceled-after-acceptance | provider may have billed | no — reconcile (R8·4) |

**The ordering rule that makes this durable, and the reason it works:** the transition
`prepared → submitting` **must be committed before the first byte is transmitted.** Therefore any row
found in `submitting` provably *may* have reached the provider, and any row still in `prepared` provably
never did. That gives the reaper and the compensation path a sound basis for their decision instead of an
inference from absence of evidence.

- **Reaper, corrected:** `prepared` rows past their lease → abandon + **release**. **`submitting` rows past
  their lease → transition to `submission_unknown` and park for reconciliation, reservation stays
  `held`** (never released, never abandoned). Everything else follows R8·4. R8·6's reaper rule is
  superseded.
- **The explicit compensation path follows the same structured `SubmissionResult` rules as the normal
  path** (R5·5): it may release only on `preaccept_rejected` or a confirmed-no-job reconciliation, and it
  maps every ambiguous outcome to `submission_unknown`. There is no separate, looser compensation
  discipline — that divergence was the defect.

---

**R9·3 — The current-attempt pointer is not safely bound to the executing job or routing walk (fixes
R8·2 / R8·3).**

**Correct.** R8·2 put `current_attempt_id` on `provider_operations` — but that row is **shared by every
request using the same `(provider_connection_id, cache_key)`**, so it cannot express which routing
attempt authorizes *this particular job's* execution. Compounding it: one job may touch several
operations across the fallback chain; one child job may accumulate several historical routing attempts;
and there is no durable single-winner pointer telling a worker which pair currently authorizes it. Nor
did round 8 database-enforce that `current_attempt_id` belongs to the same operation, that
`accepted_attempt_id` belongs to the same routing attempt, or that a reservation's accepted attempt
belongs to its own routing attempt — all three were left to application discipline.

**Correction — a durable execution binding on the job, plus composite foreign keys that make every
cross-pointer structurally impossible.**

- **New additive table `job_execution_bindings`** — the durable, single-winner pointer (chosen over
  widening `jobs`, to keep the verbatim §2 `jobs` table untouched):
  - `job_id TEXT PRIMARY KEY REFERENCES jobs(id)` — one live binding per job, enforced by the PK
  - `routing_attempt_id TEXT NOT NULL` — which walk currently authorizes this job
  - `provider_attempt_id TEXT NULL` — which attempt within that walk (NULL between candidates)
  - `updated_at TIMESTAMPTZ NOT NULL`
- **Execution resolution is a single chain with no ambiguity:** job → `job_execution_bindings` →
  `routing_attempt_id` → `provider_attempt_id` → `execution_mode` + `provider_job_id`. R8·2's
  `provider_operations.current_attempt_id` is **retained only as the operation's own current-attempt
  marker** (for the R9·1 claim-miss branch), and is **no longer** the thing a worker resolves execution
  mode through.
- **Composite foreign keys** (each requires the matching composite unique key on the referenced table, so
  the constraint is expressible):
  - `routing_attempts UNIQUE (id, job_id)`;
    `provider_operation_attempts UNIQUE (id, provider_operation_id)` and `UNIQUE (id, routing_attempt_id)`.
  - `job_execution_bindings (routing_attempt_id, job_id) → routing_attempts (id, job_id)` — a binding
    can never point at another job's walk.
  - `job_execution_bindings (provider_attempt_id, routing_attempt_id) → provider_operation_attempts
    (id, routing_attempt_id)` — the attempt must belong to the bound walk.
  - `provider_operations (current_attempt_id, id) → provider_operation_attempts (id,
    provider_operation_id)` — the pointer must belong to the same operation.
  - `routing_attempts (accepted_attempt_id, id) → provider_operation_attempts (id, routing_attempt_id)`
    — the accepted attempt must belong to this walk.
  - `budget_reservations (accepted_provider_operation_attempt_id, routing_attempt_id) →
    provider_operation_attempts (id, routing_attempt_id)` — the reservation's accepted attempt must
    belong to its own walk.
- **Rerun is one atomic move:** in a single transaction the rerun inserts the new routing attempt, its
  `prepared`/`submit` attempt, and **repoints `job_execution_bindings`** to both. **The job does not
  become executable until that transaction commits**, so there is no window in which a worker could
  resolve a stale walk. This supersedes R8·2's "one pointer write" mechanism, which pointed at the wrong
  row.

---

**R9·4 — The budget fallback loses pre-ledger spend when an old job later gets a reservation (fixes
R8·5).**

**Correct, and Eli's arithmetic is exact.** My R8·5 term
`NOT EXISTS (SELECT 1 FROM budget_reservations WHERE job_id = j.id)` excludes a job's **entire**
`cost_cents` the moment **any** reservation row exists for it. A job carrying $5 of pre-ledger spend that
later receives a $3 reserved-and-reconciled rerun contributes **$3**, not $8 — the original $5 silently
disappears from the cap. I introduced this while fixing a different double-counting bug and created an
under-counting one.

**Correction — backfill historical spend into the ledger and delete the fallback term entirely.** Chosen
from Eli's three options because it removes the whole class of bug rather than patching the predicate:

- **One-time migration, all-or-nothing in a single transaction:** for every pre-existing job with
  `cost_cents > 0`, insert one frozen ledger row — `origin='backfill'`, `state='reconciled'`,
  `actual_cents = jobs.cost_cents`, `period_start` = the period containing that job's `created_at`,
  `routing_attempt_id = NULL`.
- `budget_reservations` accommodates backfill rows: `routing_attempt_id` becomes **nullable**, its
  uniqueness becomes a **partial** index `UNIQUE (routing_attempt_id) WHERE routing_attempt_id IS NOT
  NULL`, plus `origin TEXT NOT NULL CHECK (origin IN ('reservation','backfill'))` and a CHECK that
  `origin='reservation'` ⇒ `routing_attempt_id IS NOT NULL` while `origin='backfill'` ⇒ `IS NULL`.
- **The committed-spend query loses its fallback term completely:**

```
committed = (SELECT COALESCE(SUM(actual_cents),0)::int FROM budget_reservations
              WHERE owner_id=$1 AND period_start=$2 AND state='reconciled')
held      = (SELECT COALESCE(SUM(reserved_cents),0)::int FROM budget_reservations
              WHERE owner_id=$1 AND period_start=$2 AND state='held')
```

  Backfilled and reserved spend are now the same kind of row, counted by the same clause, each exactly
  once, each in its own period. The `NOT EXISTS` predicate — and the bug it carried — is **retracted**.
- **Crossover guard:** creating a reservation against a job that has **not** been backfilled is
  prohibited. Because the migration is a single all-or-nothing transaction that backfills every
  qualifying historical job, this condition is unreachable in a correctly migrated database; the guard
  exists so a partial or skipped migration fails loudly instead of silently under-counting.
- **Required test (Eli's, adopted verbatim in intent):** a job with pre-migration cost **plus** a
  post-migration reserved attempt counts **both** amounts, **exactly once each**, and **in their proper
  periods**.

---

**R9·5 — The chunk parent has no durable blocked state (fixes R7·3).**

**Correct, and it is the mechanism-level gap R7·3 left.** R7·3 said the parent "stops and waits" while
staying `running`, and that the executor "halts cleanly and returns." Those two are incompatible against
the real worker: `executeClaimed`'s `finally` clears the heartbeat interval (`worker.ts:83-85`) the moment
the handler returns, so a parent left in `running` has **no live owner and no heartbeat**. After 120
seconds it satisfies the takeover predicate at `worker.ts:39-40`, another worker claims it —
incrementing `attempt` (`worker.ts:37`) — re-enters, finds the same blocked child, and returns again.
The result is a permanent 120-second takeover loop with monotonically inflating `attempt`, for as long as
a human takes to answer an overlap prompt.

**Correction — park the parent durably; do not hold a live orchestrator.** Of Eli's two options I choose
parking, because an `awaiting_approval` child can block for hours or days and pinning a worker plus a
heartbeat to a human-scale wait is both wasteful and fragile (any worker restart loses it). Parking is
also consistent with every other resume path in this spec (R8·1 parked dispositions, R8·2 guarded resume
claim).

- **Additive `jobs.status` value `awaiting_children`** (added to the CHECK constraint alongside
  `awaiting_reconciliation`; non-terminal). The parent parks via the **R8·1 guarded parked write**
  (`disposition:'parked'`, `WHERE id=$1 AND status='running' RETURNING id`, publish only on one row) and
  records the **blocking child job id** it is waiting on.
- **Resume is a guarded, single-winner claim** with the same discipline as R8·2:
  `UPDATE jobs SET status='running', heartbeat_at=now() WHERE id=$1 AND status='awaiting_children'
  RETURNING *` — **`attempt` is not incremented** (a resume is not a delivery attempt), and zero rows
  means another worker already owns the resume.
- **Wake-up is driven by the child's terminal transition:** when the blocking child reaches `succeeded`,
  `failed`, `canceled`, or leaves `awaiting_approval`/`awaiting_reconciliation` via an operator decision
  or reconciliation, that transition enqueues a parent resume **in the same transaction** as the child's
  own state write, so the wake-up cannot be lost independently of the state change.
- **A sweeper closes the residual gap:** any parent in `awaiting_children` whose recorded blocking child
  is already terminal is re-enqueued. This covers a queue outage between commit and delivery, and is
  idempotent against the guarded claim above.
- **Governing invariant (Eli's, adopted as binding): a parent may never remain `running` without a live
  owner and heartbeat.** Any parent that cannot make progress must be parked in a durable state, never
  left `running`.
- R7·3's seven-status resume table is otherwise unchanged; the `awaiting_approval` /
  `awaiting_reconciliation` / `running` rows now specify **park the parent in `awaiting_children`** as the
  concrete mechanism behind "stop and wait."

---

**Round-9 added tests** (beyond `0032` §12, §9's seven, r5's seven, r6's six, r7's eight, r8's eight):

1. An operation claim miss against a `succeeded` operation reuses `result_key` with **zero** provider
   calls and **releases** the chain reservation; against `in_flight` it attaches and releases its own
   reservation while the owning reservation stays `held`; against `submission_unknown` it parks; against
   `failed` it applies the retry rule. **No branch falls through to another provider.**
2. A lost operation claim rolls back **only** that candidate's attempt row — the routing attempt and the
   chain reservation survive and remain owned (assert both still present and `held`).
3. Exactly one held reservation exists per billable provider operation when two jobs race onto the same
   `(provider_connection_id, cache_key)`.
4. A crash simulated **after** `prepared → submitting` commits but before any response is recorded
   resolves to `submission_unknown` with the reservation still `held`; a crash while still `prepared`
   is abandoned and **released**. The reaper reproduces both outcomes.
5. Composite FKs reject: a binding pointing at another job's routing attempt; a `current_attempt_id` from
   a different operation; an `accepted_attempt_id` from a different routing attempt; a reservation whose
   accepted attempt belongs to another walk. Each must fail at the database, not in application code.
6. A rerun repoints `job_execution_bindings` to the new routing attempt **and** its `submit` attempt in
   one transaction; the job is not executable at any intermediate point (assert no worker can resolve a
   stale walk mid-transaction).
7. **A job with pre-migration `cost_cents` plus a post-migration reserved-and-reconciled attempt counts
   both amounts, exactly once each, in their proper periods** (the R9·4 regression).
8. A parent blocked on an `awaiting_approval` child parks in `awaiting_children` and is **not** taken over
   after 120 seconds — assert `attempt` is unchanged after 3 takeover windows; when the child resolves,
   the parent resumes exactly once under the guarded claim; the sweeper re-enqueues a parent whose
   wake-up enqueue was dropped.

---

**Status after round 9:** `0032` (base) + `0033` (binding + rounds 5–9) remain the removal-lane spec.
**STILL NOT build-authorized.** Per Eli's explicit round-9 direction: **the next gate is round-nine
specification review — NOT the fal metadata probe. The probe becomes the next gate only after the
complete specification is approved**, and it additionally requires Ashley's live in-person key/network
authorization. Administrative direction recorded: keep `CC-OPUS-01` (no identifier change); do not run
the probe; do not access the fal key or network; do not implement removal-lane code; one commit only
after the round-nine correction set is complete.

**What I did / did NOT do (round-9 append):** *Did* — re-read `packages/jobs/worker.ts` (the heartbeat
`finally` at `:83-85` and the takeover predicate at `:39-40` that make R9·5 concrete),
`packages/jobs/create.ts`, `packages/providers/routing.ts` and `migrations/0001_schema.sql`; confirmed
all five blockers, including that **R8·3 and R8·6 literally contradict each other** on the same event and
that **R8·6 reintroduced the "not proven accepted ⇒ not accepted" fallacy** rounds 5–6 had already
outlawed; corrected my own inaccurate `.env.example` "all-empty" wording; restructured the transaction
model into TX-A/TX-B with candidate-scoped rollback; added the `prepared`/`submitting` durable
submission boundary; added `job_execution_bindings` + six composite FK constraints; replaced the
`NOT EXISTS` budget fallback with a backfill migration; added the `awaiting_children` parent state; added
eight tests. *Did NOT* — write or change any code; add an FFmpeg string; run the probe; read the fal key;
call any provider; touch the network; upload media; spend anything; rewrite `0032` or `0033`'s body or
any prior appendix (round-9 appended only); modify VHE-2 or the §7 `Capability` union; re-run the suite
(no source touched — figures remain **153/153 · preflight 13/4/1**, last measured at `52e3277`; no code
has changed since).

— `CC-OPUS-01` (Claude Opus 5), 2026-07-24

---

### Round-10 correction — Eli blockers on `VHE-Progress-update 12` (2026-07-26, `CC-OPUS-01`)

**Source:** Ashley relayed the reviewer ("Eli") round-ten verdict on `VHE-Progress-update 12`, reviewed
against the complete round-9 appendix and the cited source seams. **Package audit: PASS.**

**Verdict: specification REJECTED with four blockers plus one documentation correction.** Acceptance
choices returned: **(b) TX-A / per-candidate TX-B — ACCEPTED. (c) `prepared → submitting` before the
first byte — ACCEPTED. (d) `job_execution_bindings` — ACCEPTED for a job's own execution, but NOT as the
cross-job attachment mechanism. (e) historical backfill — ACCEPTED in principle over
`preledger_cost_cents`, but incomplete until every future paid path enters the ledger. (f)
`awaiting_children` — ACCEPTED in principle, but its wake-up must use a transactional outbox. (a)
claim-miss table — NOT accepted until blocker 1 and the follower path are corrected.**

Instruction: append round 10 to `0033` **only**; do not rewrite `0032`, `0033`'s body, or rounds 5–9;
make one docs-only commit (relay + handoff 38 + CURRENT-STATUS) **before** beginning the round-10
correction; **the next gate remains another specification review — not the fal probe**; no key access,
network call, provider request, implementation, upload, or spend; no full backup `v09` needed yet.

**All four blockers are correct.** Blockers 1 and 2 are a contradiction *between* R9·1 and R9·2/R9·3 —
the same class of defect round 9 caught in round 8, now in my own round-9 text. Blocker 4 is a
category error: I specified an atomicity that the chosen infrastructure cannot provide, and the code
proving it has been in the tree since §4. Rounds 5–9 are preserved above as filed; **round 10 governs
where it conflicts with any of them.**

The docs-only commit was made first, as instructed, at `2c7b944`.

---

**R10·0 — Documentation correction: five composite foreign keys, not six (corrects my own summary).**

**Correct.** R9·3's constraint list enumerates **five** composite foreign keys:

1. `job_execution_bindings (routing_attempt_id, job_id) → routing_attempts (id, job_id)`
2. `job_execution_bindings (provider_attempt_id, routing_attempt_id) → provider_operation_attempts (id, routing_attempt_id)`
3. `provider_operations (current_attempt_id, id) → provider_operation_attempts (id, provider_operation_id)`
4. `routing_attempts (accepted_attempt_id, id) → provider_operation_attempts (id, routing_attempt_id)`
5. `budget_reservations (accepted_provider_operation_attempt_id, routing_attempt_id) → provider_operation_attempts (id, routing_attempt_id)`

My round-9 closing summary said "six composite FK constraints." **The correct count is five composite
FKs**, plus the single-column `job_execution_bindings.job_id → jobs(id)` declared in the table
definition — which is a foreign key but is **not composite**, and is the likeliest source of the
miscount. No sixth composite constraint was intended or omitted. **Standing correction: R9·3 defines
five composite FKs and one single-column FK.** The same "six" error propagated into
`CURRENT-STATUS.md`, handoff 37, and `RELAY-TO-ELI_round-9_2026-07-26.md`; `CURRENT-STATUS.md` is
corrected in this session, and the handoff and relay are historical records left as filed. Round 10
adds further constraints below; they are counted separately and do not retroactively make the round-9
count six.

---

**R10·1 — `submitting` is not pollable and must not be treated like `in_flight` (fixes R9·1).**

**Correct, and it is a direct contradiction between two of my own round-9 sections.** R9·1's claim-miss
table put `submitting` and `in_flight` on one row with the action *"attach and wait — poll the recorded
`provider_job_id`."* But R9·2 defines `submitting` as *"transmission may have begun"* and captures the
provider job id only at `accepted`/`in_flight` (*"provider job id durably captured"*). **In `submitting`
there may be no `provider_job_id` to poll** — the attaching worker would be polling a column that is
still NULL, and any implementation would have had to invent behavior the spec never defined.

**Correction — the claim-miss table splits `submitting` from `in_flight`, and gains the `prepared` row
it was always missing.** The action now depends on both the operation state **and** whether the owning
attempt's lease is live:

| existing operation/attempt state | owner lease | action | second paid submit? |
|---|---|---|---|
| `succeeded` | — | **reuse** the stored `result_key` — zero provider calls; **release** this job's chain reservation (R9·1, unchanged) | no |
| `in_flight` | — | **attach as a follower and poll** the durable `provider_job_id` captured at `accepted` | no |
| `submitting` | **live** | **attach as a follower and wait on the owner's lease.** No polling — there is no durable id yet. When the owner commits its outcome, the follower re-evaluates against this same table | no |
| `submitting` | **expired (stale)** | the **R9·2 reaper rule governs**: the attempt transitions to `submission_unknown`, reservation stays **`held`**, and it parks for reconciliation. The follower parks with it | no |
| `prepared` | **live** | **wait on the owner's lease** — nothing has been transmitted and the owner may still proceed | no |
| `prepared` | **expired (stale)** | the R9·2 reaper abandons the row and **releases** its reservation (the one state where that is provably safe); the waiter then **re-evaluates from the top** and may claim the operation itself | no — the original was never transmitted |
| `submission_unknown` | — | **park for reconciliation** (R6·3 / R8·2); zero submits while indeterminate | no |
| `failed` | — | apply the **explicitly permitted retry rule** (R6·4: same operation row, new appended attempt) | no |
| `claimed` by a live worker | live | wait for the lease, then re-evaluate against this table | no |

- **Only `in_flight` may poll a durable provider job id.** This is now a binding rule, not a table cell.
- **Every "wait on the lease" branch is bounded by lease expiry** — it is not an unbounded wait. When the
  lease expires the row moves to its stale branch above, so no follower can block forever on a dead owner.
- **The `prepared` rows are mine, not Eli's.** He named only `submitting`. I found while fixing this that
  R9·1's table predates R9·2's `prepared` state and never listed it at all, leaving the first state in the
  submission boundary undefined for an attaching worker. Filing it here rather than letting it become
  round 11.
- R9·1's combined `submitting`/`in_flight` row is **retracted**. Everything else in R9·1's table stands.

---

**R10·2 — cross-job attachment cannot be expressed by `job_execution_bindings` (fixes the R9·1 ↔ R9·3
interaction).**

**Correct, and the two sections are structurally incompatible as filed.** R9·1 permits Job B to attach to
an operation whose in-flight attempt is owned by **Job A's** routing attempt. R9·3 then constrains
`job_execution_bindings` so that `(routing_attempt_id, job_id) → routing_attempts (id, job_id)` — the
bound walk must belong to **this** job — and `(provider_attempt_id, routing_attempt_id) →
provider_operation_attempts (id, routing_attempt_id)` — the bound attempt must belong to **that** walk.
Job B therefore **cannot legally record what it attached to**: the only pointer round 9 gave it is a
pointer the database will reject. R9·1's sentence *"the attaching job records the operation it attached
to"* named no location, which is exactly how the gap survived filing.

**Correction — a separate durable follower relationship at the provider-operation level. The
execution-binding foreign keys are NOT weakened.**

- **New additive table `provider_operation_followers`:**
  - `provider_operation_id TEXT NOT NULL REFERENCES provider_operations(id)`
  - `follower_job_id TEXT NOT NULL REFERENCES jobs(id)`
  - `follower_routing_attempt_id TEXT NOT NULL` — the follower's **own** walk
  - `state TEXT NOT NULL CHECK (state IN ('waiting','resolved','parked'))`
  - `attached_at TIMESTAMPTZ NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL`
  - `PRIMARY KEY (provider_operation_id, follower_job_id)` — one follow per job per operation, idempotent
    under retry
  - **composite FK** `(follower_routing_attempt_id, follower_job_id) → routing_attempts (id, job_id)` —
    the follower's recorded walk must belong to the follower itself. **The same-job discipline R9·3
    established is preserved, not relaxed**: a follower still never points at another job's walk or
    attempt.
- **The follower's `job_execution_bindings` row is unchanged and still same-job**: it continues to point
  at the follower's own `routing_attempt_id` with `provider_attempt_id = NULL` while following — the NULL
  state R9·3 already defined for "between candidates." Attachment is recorded **only** in
  `provider_operation_followers`. The two relationships never overlap: `job_execution_bindings` answers
  "what authorizes this job to execute," `provider_operation_followers` answers "what external operation
  is this job waiting on."
- **Terminal / reconciliation wake-up.** When the operation reaches `succeeded`, `failed`, or
  `submission_unknown`, **every `waiting` follower is woken** through the R10·4 outbox — one outbox row
  per follower, inserted in the **same Postgres transaction** as the operation's own state write. On wake
  the follower re-evaluates the R10·1 table against the operation's new state:
  - operation `succeeded` → reuse `result_key`, zero spend, follower `resolved`.
  - operation `submission_unknown` → follower `parked`, awaiting the same reconciliation.
  - operation `failed` → the follower resumes **its own** routing walk at the next candidate.
- **Consequence I must state explicitly, because R9·1 created it and did not follow it through:** R9·1
  **released** the attaching job's chain reservation at attach time (invariant: exactly one held
  reservation per billable operation). So a follower woken by a **`failed`** operation holds **no
  reservation** and **must acquire a fresh one before attempting any paid candidate.** That acquisition
  is an ordinary reservation request and **may legitimately fail against the cap**, in which case the
  follower fails with the standard budget error rather than proceeding unfunded. **Binding rule: a
  follower may never resume a paid attempt on a released reservation.** Eli did not name this; it falls
  out of his blocker and would otherwise have been discovered in implementation.
- **Cancellation:** if a follower's own job is canceled while `waiting`, its row moves to `resolved` and
  the owning operation is unaffected — a follower never influences the owner's lifecycle.

---

**R10·3 — deleting the budget fallback drops future non-reservation spend (fixes R9·4).**

**Correct, and verified against the tree it is worse than "future jobs" — it silently zeroes the spend of
the lane that is already built.** R9·4 deleted the fallback term and left committed spend reading
**only** ledger rows, which only the removal-lane routing path writes. But:

- `packages/jobs/worker.ts:68-72` is the **universal §4.2 terminal-success write for every job type**:
  `UPDATE jobs SET status='succeeded', ..., cost_cents=$3, provider_id=$4 ...`, taking `result.costCents`
  from any handler. It knows nothing about routing attempts or reservations.
- `packages/jobs/create.ts:56-68` (`periodSpendCents`) is today's **only** spend reader:
  `SELECT COALESCE(SUM(cost_cents), 0)::int AS spend FROM jobs WHERE owner_id = $1 AND created_at >= ...`.
- `migrations/0001_schema.sql:104` states the blueprint's own model in a comment:
  `-- spend is computed live: SUM(jobs.cost_cents) WHERE owner_id=? AND created_at >= period_start`.

So every already-shipped paid path — the §9.1 OpenAI call and the §9.2 fal `image.inpaint`
content-replacement lane — bills through `worker.ts:68-72` with **no routing attempt and no
reservation**. Under R9·4 as filed, all of it would have vanished from the monthly cap the moment the
migration ran. My round-9 text said the backfill "removes the whole class of bug"; it removed the
historical half and opened a forward-going one.

**Correction — a third ledger origin for direct spend, so every paid path enters the ledger.**

- `budget_reservations.origin` CHECK extends to **`('reservation','backfill','direct')`**.
- **`direct` rows:** `routing_attempt_id IS NULL`, `state='reconciled'`, `actual_cents` = the billed
  amount, `job_id` set, `period_start` = the period containing that job's `created_at`. They are counted
  by the same `state='reconciled'` clause as reservation and backfill rows — R9·4's committed/held query
  is **unchanged**, and the `NOT EXISTS` fallback stays deleted.
- The existing CHECK is extended accordingly: `origin='reservation'` ⇒ `routing_attempt_id IS NOT NULL`;
  `origin IN ('backfill','direct')` ⇒ `routing_attempt_id IS NULL`. The partial unique index on
  `routing_attempt_id WHERE NOT NULL` is unaffected.
- **Where the direct row is written:** in the **same Postgres transaction** as the terminal `jobs` write
  at `worker.ts:68-72`. Both statements are Postgres, so this atomicity is real — **unlike R9·5's, which
  was not (see R10·4).** Writing it anywhere else reintroduces the same lost-update class.
- **Idempotency:** the direct row is keyed so that a re-delivered terminal write cannot double-insert —
  `UNIQUE (job_id) WHERE origin='direct'`. A job bills exactly once through this path.
- **Governing invariant (new): every cent recorded in `jobs.cost_cents` appears exactly once in
  `budget_reservations` as a reconciled row, in the period containing the job's `created_at`.** Backfill
  covers history, `direct` covers non-routed spend, `reservation` covers routed spend. A reconciliation
  check asserting per-owner, per-period equality of `SUM(jobs.cost_cents)` and `SUM(actual_cents)` over
  reconciled rows is the standing detector for any future path that forgets.

**OPEN DECISION for the owner — flagged, not decided (VHE-2 §0 verbatim rule).** `worker.ts:68-72` is
transcribed **verbatim** from VHE-2 §4.2, and §0 permits adapting only `// BUILDER:` lines. Adding a
second statement inside that transaction is additive and leaves the `UPDATE jobs ...` token sequence
untouched, but it does modify the §4.2 body. **I am not choosing this unilaterally.** The three options
are: (i) accept an additive statement inside the §4.2 transaction under a `// BUILDER:` note; (ii) wrap
the §4.2 write in a caller-supplied transaction so the ledger insert lives outside the verbatim block;
(iii) treat it as an authorized blueprint amendment to VHE-2 §4.2. **Ashley decides; Eli's view is
welcome.** Until it is decided, R10·3 specifies the *requirement* (same transaction) and not the
*edit site*.

**Pre-existing limitation, named but deliberately NOT fixed here (no scope growth):** direct-spend jobs
hold no reservation while running, so concurrent one-shot jobs can overshoot the cap between the §4.1
pre-check and the terminal write. That is the **existing** §4.1/§2 behavior, unchanged by round 10 and
not introduced by it. Reserving for non-routed jobs would be a new design, and I am not adding one
uninstructed. Flagged for Eli and the owner as a known gap.

---

**R10·4 — a Postgres state write and a BullMQ enqueue cannot share a transaction (fixes R9·5).**

**Correct, and it is a category error on my part, not an oversight of detail.** R9·5 promised the child's
terminal transition *"enqueues a parent resume in the same transaction as the child's own state write, so
the wake-up cannot be lost independently of the state change."* Verified in the tree: job state lives in
Postgres (`pg` Pool), while the queue is **BullMQ over ioredis** —
`packages/queue/connection.ts:40-52` opens the Redis client, `packages/queue/queues.ts:71-72` constructs
`new Queue(type, { connection })`. **Two different stores. There is no shared transaction, and a
Postgres `COMMIT` cannot make a Redis write atomic with it.** The guarantee I claimed does not exist.

**Correction — a transactional outbox, exactly as Eli specified.**

- **New additive table `job_wakeup_outbox`:**
  - `id BIGSERIAL PRIMARY KEY`
  - `target_job_id TEXT NOT NULL REFERENCES jobs(id)` — the parent to resume, or the follower to wake
  - `target_job_type TEXT NOT NULL` — the BullMQ queue name to enqueue on
  - `reason TEXT NOT NULL CHECK (reason IN ('child_terminal','operation_terminal','sweeper'))`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `dispatched_at TIMESTAMPTZ NULL`,
    `dispatch_attempts INT NOT NULL DEFAULT 0`
  - partial index `ON job_wakeup_outbox (created_at) WHERE dispatched_at IS NULL`
- **The outbox row is inserted in the same Postgres transaction as the child's terminal state write** (and,
  per R10·2, as the operation's terminal write for followers). **This atomicity is real** — both
  statements are Postgres. The wake-up intent therefore cannot be lost independently of the state change,
  which is what R9·5 actually needed.
- **A dispatcher** polls undispatched rows, enqueues to BullMQ, and stamps `dispatched_at`. Delivery is
  **at-least-once**: a crash between the enqueue and the stamp re-delivers.
- **At-least-once is sufficient here, and the reason is already in the tree — this is the full chain:**
  1. the outbox guarantees the intent survives (Postgres, same transaction);
  2. BullMQ's `{ jobId }` dedupe drops a duplicate enqueue — the project's established second safety net
     (`packages/queue/queues.ts:79`, proven by `packages/queue/runtime.test.ts:173-179`);
  3. R9·5's guarded single-winner resume claim
     (`UPDATE jobs SET status='running' ... WHERE id=$1 AND status='awaiting_children' RETURNING *`)
     returns zero rows for any loser, so even a duplicate delivery that escapes 1–2 cannot double-resume
     or inflate `attempt`.
  Effectively-once resume comes from all three together, not from the outbox alone.
- **The sweeper stays as recovery** (R9·5, unchanged): any parent in `awaiting_children` whose recorded
  blocking child is already terminal is re-enqueued, covering a dispatcher outage entirely. It writes
  outbox rows with `reason='sweeper'` rather than enqueuing directly, so every enqueue has one path.
- **R9·5's "enqueued in the same transaction as the child's terminal write" is RETRACTED** as written and
  replaced by "**an outbox row** is inserted in the same transaction as the child's terminal write."

**Concrete durable location of `blocking_child_job_id` (Eli asked; R9·5 never said).**

- **New additive table `job_parent_blocks`:**
  - `parent_job_id TEXT PRIMARY KEY REFERENCES jobs(id)` — the PK enforces **one live block per parent**,
    matching the one-parked-state-per-parent invariant
  - `blocking_child_job_id TEXT NOT NULL REFERENCES jobs(id)`
  - `blocked_at TIMESTAMPTZ NOT NULL`
  - **composite FK** `(blocking_child_job_id, parent_job_id) → jobs (id, parent_job_id)`, requiring the
    additive `jobs UNIQUE (id, parent_job_id)`. This makes it **structurally impossible** to record a
    block on a job that is not actually this parent's child — the same technique R9·3 used, applied here.
- **Chosen over widening `jobs`** for the reason R9·3 gave: the §2 `jobs` table is verbatim. Adding a
  UNIQUE index is additive and does not alter the verbatim `CREATE TABLE` token sequence; adding a column
  would.
- The row is written in the same transaction as the parent's guarded park write, and cleared when the
  parent resumes.

---

**Round-10 added tests** (beyond `0032` §12, §9's seven, r5's seven, r6's six, r7's eight, r8's eight,
r9's eight):

1. A claim miss against an operation in **`submitting` with a live owner lease** attaches as a follower
   and **never reads `provider_job_id`** (assert no poll is issued while the column is NULL); when the
   owner reaches `in_flight`, the woken follower polls the now-durable id.
2. A claim miss against a **stale `submitting`** operation yields `submission_unknown` with the
   reservation still **`held`**, and the follower parks — no release, no second submit.
3. A claim miss against a **stale `prepared`** operation abandons + **releases** the original, and the
   waiter re-evaluates and may claim the operation itself; against a **live `prepared`** it waits.
4. A follower row is rejected by the database when `follower_routing_attempt_id` belongs to another job;
   the follower's own `job_execution_bindings` row remains same-job with `provider_attempt_id IS NULL`
   throughout the follow.
5. A follower woken by a **`failed`** operation holds **no** reservation and **cannot** start a paid
   candidate until it acquires a fresh one; when the cap is exhausted it fails with the standard budget
   error rather than proceeding unfunded.
6. **A future paid job that uses no routing attempt** (an ordinary one-shot provider job billing through
   `worker.ts:68-72`) writes an `origin='direct'` reconciled ledger row in the same transaction and
   **counts against the monthly cap** — Eli's required regression. Re-delivering the terminal write does
   **not** double-insert (the `UNIQUE (job_id) WHERE origin='direct'` guard).
7. Per-owner, per-period `SUM(jobs.cost_cents)` equals `SUM(actual_cents)` over reconciled ledger rows
   across a mixed population of backfilled, direct, and reservation-billed jobs — the standing invariant.
8. A child's terminal transition and its outbox row **commit or roll back together** (assert no outbox row
   survives a rolled-back child transition, and none is missing after a committed one).
9. A dispatcher crash **after** enqueue and **before** stamping `dispatched_at` re-delivers; the parent
   still resumes **exactly once** and `attempt` is unchanged (BullMQ `{ jobId }` dedupe + the guarded
   claim).
10. With the dispatcher stopped entirely, the sweeper alone resumes a parent whose blocking child has gone
    terminal; `job_parent_blocks` rejects a block naming a job that is not this parent's child.

---

**Status after round 10:** `0032` (base) + `0033` (binding + rounds 5–10) remain the removal-lane spec.
**STILL NOT build-authorized.** Per Eli's explicit round-ten direction: **the next gate is another
specification review — NOT the fal metadata probe.** Administrative direction recorded and applied: the
docs-only commit was made first (`2c7b944`); round 10 is appended only; `0032`, `0033`'s body, and rounds
5–9 are unmodified; no full backup `v09` this round.

**What I did / did NOT do (round-10 append):** *Did* — re-read `packages/jobs/worker.ts` (the universal
terminal-success write at `:68-72`, the heartbeat `finally` at `:83-85`, the takeover predicate at
`:39-40`), `packages/jobs/create.ts` (`periodSpendCents` at `:56-68`), `packages/queue/connection.ts`
(`:40-52`), `packages/queue/queues.ts` (`:71-72`, `:79`), `packages/queue/runtime.test.ts` (`:173-179`),
and `migrations/0001_schema.sql` (`jobs` at `:50-70`, the spend-model comment at `:104`); confirmed all
four blockers against that code; confirmed the FK miscount by enumerating R9·3's list; found and filed
two consequences Eli did not name — the missing **`prepared`** rows in the claim-miss table, and that a
follower woken by a **failed** operation must **re-acquire** the reservation R9·1 released; established
that blocker 3 affects the **already-built** content-replacement lane, not only hypothetical future jobs;
flagged the VHE-2 §4.2 verbatim boundary as an **OPEN DECISION for the owner** rather than choosing;
named the pre-existing non-routed cap-overshoot gap without fixing it. *Did NOT* — write or change any
code; run the test suite (no source touched — figures remain **153/153 · preflight 13/4/1**, last
measured at `52e3277`); run the probe; read the fal key; call any provider; touch the network; upload
media; spend anything; rewrite `0032` or `0033`'s body or any prior appendix (round-10 appended only);
modify VHE-2 or the §7 `Capability` union; weaken any R9·3 foreign key; cut a full backup.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-26

---

### Round-11 correction — Eli blockers on `VHE-Progress-update 13` (2026-07-27, `CC-OPUS-01`)

**Source:** Ashley relayed the reviewer ("Eli") round-eleven verdict on `VHE-Progress-update 13`, reviewed
against the complete round-10 appendix, prior rounds, VHE-2, and the queue/job/budget source seams.
**Package audit: PASS.**

**Verdict: specification REJECTED with seven blockers.**

Instruction recorded: append round 11 to `0033` **only**; preserve `0032`, the `0033` body, and rounds
5–10 exactly as filed; **do not build `Progress-update 14` until the round-11 corrections are filed and
committed**; no implementation, fal probe, key access, network call, provider request, upload, or spend.

**All seven blockers are correct, and every one was confirmed against the real tree or the real prior
text before a word of correction was written** — file:line for each is given in its section. Rounds 5–10
are preserved above as filed; **round 11 governs where it conflicts with any of them.**

The pattern is unchanged and worth stating plainly: **five of the seven blockers are defects introduced by
round 10's own correction.** Two are verbatim contradictions between round 10's rules and round 10's own
tests (R11·2, R11·6). One is a conflict between two round-10 sections (R11·3). One is a mechanism whose
cited safety net does the *opposite* of what I claimed (R11·4). One is a grain error (R11·7). The two
remaining (R11·1, R11·5) are gaps round 10 opened and never closed. **The specific check that would have
caught R11·2 and R11·6 is trivial and I did not run it: read my own added tests back against my own added
rules.** That check is now written into the closing discipline below.

---

**R11·1 — The follower relationship has no durable job lifecycle (fixes R10·2).**

**Correct, and it is a hole of the same shape as R9·5's, which I filed two rounds ago and did not
generalize.** R10·2 defined `provider_operation_followers.state` — the state of the *relationship* — and
never defined the follower **job's** own `jobs.status` while it waits. Verified against the real worker:

- If the follower handler returns while the job is `running`, `worker.ts:68-72` — the universal §4.2
  terminal-success write — marks it **`succeeded`** with `progress=1` and whatever `costCents` the handler
  returned. A job that has produced nothing is reported as finished.
- If it instead stays `running` without returning, `executeClaimed`'s `finally` clears the heartbeat
  interval only on return (`worker.ts:83-85`), so a live handler must be pinned to a provider-scale wait;
  and if the worker dies, `worker.ts:39-40`'s 120-second takeover reclaims the row and `worker.ts:37`
  **increments `attempt`** — R9·5's takeover loop, reproduced exactly, in a new place.

This is the same invariant R9·5 adopted as binding: **a job may never remain `running` without a live
owner and heartbeat.** R10·2 violated it for followers.

**Correction — a durable waiting state for the follower job, generalized rather than special-cased.**

- **Additive `jobs.status` value `awaiting_provider_operation`** (added to the CHECK constraint alongside
  `awaiting_reconciliation` and `awaiting_children`; **non-terminal**).
- **Park** via the **R8·1 guarded write**, no exception:
  `UPDATE jobs SET status='awaiting_provider_operation', … WHERE id=$1 AND status='running' RETURNING id`
  — publish only when exactly one row returns; zero rows means a concurrent transition (typically a
  cancel) won and the worker publishes nothing and returns.
- **Resume is a separate guarded, single-winner claim**, with R9·5's discipline:
  `UPDATE jobs SET status='running', heartbeat_at=now() WHERE id=$1 AND status='awaiting_provider_operation' RETURNING *`
  — **`attempt` is NOT incremented**; a resume is not a delivery attempt. Zero rows ⇒ another worker owns
  the resume.
- **Structural link to the follower row.** The park write and the `provider_operation_followers` insert
  occur in **one Postgres transaction**; the follower row's `(provider_operation_id, follower_job_id)`
  primary key (R10·2, unchanged) is the link. A job in `awaiting_provider_operation` with no `waiting`/
  `parked` follower row is a **detectable invariant violation** and is swept, not ignored.
- **Cancellation.** Canceling a follower job transitions it from `awaiting_provider_operation` to
  `canceled` under a guard on that exact state, and in the same transaction resolves its follower row to
  `resolved`. **The owning operation is untouched** — no state change, no reservation change, no effect on
  any other follower. This preserves R10·2's rule and now has a real state to act on.
- **My addition, not Eli's — the guard predicate for a parked job's terminal writes.** R8·1's uniform
  discipline is written as `WHERE id=$1 AND status='running'`, which is correct for *worker dispositions*
  but cannot express a transition **out of** a parked state. Binding clarification: **every guarded write
  names the exact state it is entitled to replace** — `'running'` for worker dispositions,
  `'awaiting_provider_operation'` for a follower resume or cancel, `'awaiting_children'` for a parent
  resume or cancel. R8·1's *discipline* (guard, then publish only on one returned row) is unchanged and
  now stated generally. A blanket `status='running'` guard would silently no-op on every parked job.
- **Verified as safe, not assumed:** the `0017` graceful-handback requeue in the BUILDER-owned transport
  (`runtime.ts:90-94`) is guarded `WHERE id=$1 AND status='running'`, so it **cannot** drag a parked job
  back to `queued`. That guard was written for a different reason and happens to be exactly right here.

---

**R11·2 — The follower wake-up set contradicts round 10's own test and strands `parked` followers
(fixes R10·2).**

**Correct on both counts, and both are verbatim contradictions inside round 10.**

1. R10·2 (`0033:1829-1831`) wakes `waiting` followers when the operation reaches **`succeeded`,
   `failed`, or `submission_unknown`**. Round-10 **test 1** (`0033:1970-1972`) requires that *"when the
   owner reaches `in_flight`, the woken follower polls the now-durable id."* **`in_flight` is not in the
   wake-up set.** The test asserts behavior the rule does not produce.
2. A follower woken by `submission_unknown` becomes **`parked`** (`0033:1834`). When reconciliation later
   drives that operation to `succeeded` or `failed`, the wake-up rule fires for **`waiting`** followers
   only (`0033:1830`). **A `parked` follower is therefore never woken again** — a durable dead end holding
   a job in a non-terminal state indefinitely.

**Correction — adopt Eli's coherent model: followers never poll. Provider polling belongs to the owner or
the reconciler, exclusively.**

- **Binding rule: a follower job never issues a provider poll and never reads `provider_job_id`.** Only
  the job that owns the operation's current attempt, or the reconciler, communicates with the provider.
  This retracts R10·1's table cell *"attach as a follower and poll the durable `provider_job_id`"* for
  `in_flight`; the follower **attaches and parks**, and the owner's or reconciler's outcome wakes it.
  R10·1's `in_flight` row is corrected accordingly: **attach as a follower and park** — the "no second
  paid submit" column is unchanged, which was the point of that row.
- **Follower states:** `waiting` (attached, parked, no actionable outcome yet) · `resolved` (terminal for
  the relationship: reused, resumed, or canceled) · `parked` is **retracted as a distinct state** — it
  encoded "waiting, but for reconciliation instead," a distinction the follower does not need to make and
  the one that created the dead end. Reconciliation state belongs to the **operation**, not to each
  follower.
- **Exact wake-up set — every transition, stated once.** Every `waiting` follower of an operation is woken,
  through the R10·4 outbox, in the **same Postgres transaction** as the operation's state write, when the
  operation enters **any** of: `succeeded` · `failed` · `submission_unknown` · **`in_flight`** (the state
  round-10 test 1 requires and the rule omitted) · and **every reconciliation transition out of
  `submission_unknown`** (to `succeeded`, `failed`, or a confirmed-no-job outcome).
- **On wake, the follower re-evaluates the R10·1 table against the operation's current state** and either
  resolves (reuse on `succeeded`), re-parks as `waiting` (still indeterminate), or takes the R11·3 branch
  below. **Because it re-parks as `waiting` rather than into a second state, every later transition wakes
  it.** The dead end is closed structurally, not by adding another wake-up rule.
- **Bounded, as R10·1 required:** every wait remains bounded by the owning attempt's lease expiry; a lease
  expiry is itself an operation transition and therefore a wake-up.

---

**R11·3 — The failed-operation branch contradicts R10·1 and may advance past a billed attempt
(fixes R10·2).**

**Correct, and the second half is the more serious half.** R10·1's table (`0033:1782`) sends an existing
`failed` operation down the **R6·4 retry rule** — same operation row, new appended attempt, no silent
provider skip. R10·2 (`0033:1835`) says a follower woken by `failed` *"resumes its own routing walk at the
next candidate."* Those are different actions for the same input. Worse, the second one is unsafe on its
own terms: **generic `failed` does not prove pre-acceptance rejection.** R5·5 (`0033:370-383`) defines
`preaccept_rejected` as the **only** submission result permitted to fall through to another provider, and
R8·4 (`0033:1217`) establishes that an **accepted-then-failed** operation may well have been **billed**.
Advancing to the next paid candidate on a generic failure is precisely the double-spend R5·5 and the
§6 fall-through guard exist to prevent.

**Correction — the branch is decided by the structured submission outcome, never by the label `failed`.**

| operation outcome | follower action | second paid submit? |
|---|---|---|
| proven **`preaccept_rejected`** (R5·5 structured result) | may continue its **own** routing walk at the next candidate — **only after acquiring a fresh reservation** (R10·2's consequence rule, unchanged) | yes, legitimately |
| **ambiguous** (no structured outcome; `submission_unknown`) | **park as `waiting`** for reconciliation; zero submits while indeterminate | no |
| **accepted, then failed** provider-side | the charge is reconciled per **R8·4** (`reconcile`, never release). The follower does **not** auto-advance. It may proceed only under the **R6·4 explicitly-permitted retry** — same operation row, new appended attempt — or fail | no automatic fall-through |
| **canceled after acceptance** | as above: reconcile the charge (R8·4); no automatic fall-through | no |

- **R10·2's sentence "operation `failed` → the follower resumes its own routing walk at the next
  candidate" is RETRACTED** and replaced by this table.
- **R10·1's `failed` row is narrowed, not retracted:** it correctly points at R6·4, and R6·4 applies to an
  **explicitly authorized** retry of the same operation. It never authorized an automatic walk-advance.
- **Binding rule (restating R5·5 where round 10 lost it): no paid fall-through to another provider without
  a structured `preaccept_rejected` on the current candidate.** A label alone is never sufficient.

---

**R11·4 — BullMQ's `{ jobId }` dedupe does not deduplicate the wake-up; it prevents it (fixes R10·4).**

**Correct, and this is the most consequential of the seven: the mechanism I cited as a safety net does the
opposite of what I said.** R10·4 step 2 (`0033:1936-1937`) leaned on *"BullMQ's `{ jobId }` dedupe drops a
duplicate enqueue — the project's established second safety net."* Verified in the tree:

- `packages/queue/queues.ts:85` — `await q.add(type, { jobId }, { jobId, ...RETRY_POLICY })`. The BullMQ
  **custom job id is the DB job id**.
- **`removeOnComplete` / `removeOnFail` appear nowhere in `packages/`** (grep: zero hits), and the project
  is on **`bullmq` 5.80.1** (`package.json:20`), which retains completed jobs by default.
- Therefore the original delivery for a parent **remains present as a completed job under that id** after
  its handler parks and returns. Adding a new job with the same custom id is **ignored** — so using
  `target_job_id` as the wake-up job id means **the resume is never enqueued at all.**

**Correction — two identities, exactly as Eli specified.**

- **BullMQ delivery id:** deterministic from the outbox row — **`wake:{outbox_id}`**. Never the target job
  id.
- **Payload:** `{ targetJobId, wakeKind, outboxId }` (`wakeKind` is R11·5's).
- **A dispatcher retry of the same outbox row reuses the same delivery id**, so at-least-once dispatch
  still collapses to one delivery. **A later legitimate wake-up is a new outbox row, hence a new id, hence
  a new queue job** — which is exactly the case the old design destroyed.
- **R10·4's effectively-once chain is corrected**, not merely re-worded. Step 2 now reads: *BullMQ's custom
  job id dedupes retries of the same outbox row.* Steps 1 (the outbox row is atomic with the state write)
  and 3 (R9·5's guarded single-winner claim returns zero rows for any loser) stand unchanged, and step 3
  remains the only thing preventing a double resume across *different* outbox rows.
- **Honest boundary on what is proven.** `packages/queue/runtime.test.ts:173-179` proves duplicate-add
  suppression **live**, but against a queue with no worker attached — the duplicate is suppressed while the
  job is **waiting**. It does **not** exercise re-adding an id whose job has **completed**, which is the
  case that breaks the resume. That behavior is documented BullMQ semantics; **it is not measured in this
  tree, and I did not measure it this session** (no Redis, no network). Round-11 test 4 below exists to
  close exactly that gap before any of this is built.

---

**R11·5 — The worker transport cannot reach any resume claim (fixes R9·5 and R10·4 together).**

**Correct, and it is the gap that makes R9·5 undeliverable rather than merely incomplete.** R9·5 defined a
separate guarded resume claim; round 10 defined the outbox that carries the intent; **neither defined how
a queue delivery selects the resume claim instead of the ordinary execution claim.** Verified:

- `packages/queue/runtime.ts:49` — `Processor<{ jobId: string }, void, string>`; the payload type admits
  **only** `jobId`.
- `runtime.ts:54-55` — `const { jobId } = bull.data;` is the whole of the payload handling.
- `runtime.ts:62` — every delivery calls `claimForExecution`, whose predicate (`worker.ts:39-40`) admits
  **only** `status='queued'` or a `running` row with a heartbeat older than 120 seconds.

So a delivery for a job in `awaiting_children`, `awaiting_provider_operation`, or
`awaiting_reconciliation` claims **nothing**, `row === null`, and `runtime.ts:66` drops it silently as a
"stale duplicate delivery." **Every resume in rounds 9–10 is silently discarded by the existing transport.**

**Correction — a durable `wakeKind` on the outbox row and in the queue payload, dispatched explicitly.**

- `job_wakeup_outbox` gains **`wake_kind TEXT NOT NULL`**, and the R10·4 `reason` column is retained as the
  *cause* (audit) while `wake_kind` is the *action* (dispatch). They are not the same thing and are not
  merged.
- Supported values, closed set (a delivery carrying an unknown `wake_kind` is a hard error, never a
  fallback to `execute`): **`execute`** · **`resume_children`** · **`resume_provider_follower`** ·
  **`resume_reconciliation`**.
- The processor selects the claim from `wake_kind` **and nothing else**. **Binding rule: the claim mode is
  never inferred from the job's status after delivery** — status is mutable and racy, and inferring from it
  reintroduces the ambiguity this correction removes.
- **Scope note, stated so it is not discovered later:** this changes the processor's payload type from
  `{ jobId }` to `{ targetJobId, wakeKind, outboxId }` (with `{ jobId }` retained as the `execute` shape for
  §4.1's verbatim `add(type, { jobId }, { jobId })` line, which is **not** modified). `runtime.ts` is
  BUILDER-owned transport, not verbatim §4.2 — the verbatim body in `packages/jobs/worker.ts` is untouched
  by this. That distinction is the same one `0017` established and it is deliberately preserved.

---

**R11·6 — The sweeper cannot cover a stopped dispatcher (fixes R10·4 and round-10 test 10).**

**Correct, and it is a third contradiction between a round-10 rule and a round-10 test.** R10·4
(`0033:1943-1945`) says the sweeper *"writes outbox rows with `reason='sweeper'` rather than enqueuing
directly, so every enqueue has one path,"* and in the same breath claims it covers *"a dispatcher outage
entirely."* Round-10 **test 10** (`0033:1994-1995`) then asserts that **with the dispatcher stopped
entirely, the sweeper alone resumes a parent.** A component that only inserts rows into a table cannot
deliver those rows when the only thing that reads that table is stopped. The claim and the test are both
wrong; the test asserts something the design cannot do.

**Correction — one real guarantee, stated without ambiguity.**

- **The sweeper repairs missing or lost wake-up *intent*. It does not provide delivery availability.** It
  scans for jobs parked in `awaiting_children` / `awaiting_provider_operation` / `awaiting_reconciliation`
  whose blocking condition has already resolved and **inserts a fresh outbox row** (new `outbox_id` ⇒ new
  `wake:{outbox_id}` delivery id ⇒ genuinely new queue job, per R11·4).
- **Delivery availability is a deployment property, not a sweeper property: redundant dispatcher
  instances.** If every dispatcher is down, wake-ups are **delayed, not lost** — the outbox rows persist and
  are dispatched when a dispatcher returns. That is the honest guarantee and it is the one the design
  actually provides.
- **R10·4's "covering a dispatcher outage entirely" is RETRACTED.** **Round-10 test 10 is RETRACTED** and
  replaced by round-11 test 6 below. Its second clause (`job_parent_blocks` rejects a block naming a
  non-child) is unaffected and is retained.
- **My addition, not Eli's — the sweeper's re-insert needs a bounded key, and a naive one breaks the
  repair.** The sweeper runs periodically, so an unconditional insert grows the outbox without bound.
  A blanket `UNIQUE (target_job_id, wake_kind)` would be worse: it would block the **new** row that is the
  only thing able to re-wake a target whose earlier delivery was consumed but ineffective (the wake job
  completed, the claim lost a race). **Rule: a partial unique index over undispatched rows only —
  `UNIQUE (target_job_id, wake_kind) WHERE dispatched_at IS NULL`.** Pending intent is deduplicated;
  a fresh wake after a dispatched-but-ineffective one is always permitted.

---

**R11·7 — `origin='direct'` has the wrong billing grain and loses charged failures (fixes R10·3).**

**Correct, and it contradicts a rule I filed myself three rounds ago.** R10·3 (`0033:1879-1883`) writes one
direct ledger row **per job**, keyed `UNIQUE (job_id) WHERE origin='direct'`, and **only** beside the
terminal-success update. Verified against the tree and against R8·4:

- The worker runs **up to three execution attempts** — `worker.ts:76` (`if (retryable && row.attempt < 3)
  throw e`) and `RETRY_POLICY = { attempts: 3 }` (`queues.ts:59-62`). A one-row-per-job key cannot
  represent two billed attempts.
- **R8·4 (`0033:1217-1218`) already established** that an **accepted-then-failed** or **canceled-after-
  acceptance** attempt must be **reconciled to the real charge and never released.** A success-only insert
  discards every one of those charges on the direct path — the same "erases real spend from the cap"
  failure R8·4 was written to stop, reintroduced by R10·3 in a different lane.

**Correction — the ledger grain is one billable execution attempt, never one job.**

- **Durable key:** the **provider charge / provider operation attempt identifier when one exists**;
  otherwise **`(job_id, execution_attempt)`**. `UNIQUE (job_id, execution_attempt) WHERE origin='direct'`
  replaces `UNIQUE (job_id) WHERE origin='direct'`, which is **RETRACTED**.
- **`execution_attempt` is the `attempt` value carried by the row returned from the claim**
  (`worker.ts:35-45` `RETURNING *`), captured at claim time and frozen for that execution — **not** a live
  read of `jobs.attempt`. **My addition, and it matters:** `jobs.attempt` is mutated by `worker.ts:37` on
  every claim including a stale takeover, so a late read would key a charge under the wrong attempt and
  could either double-insert or silently collide. R9·5's resume claim deliberately does not increment
  `attempt`, so a resumed execution correctly keeps its original key.
- **Write a ledger row for every known billed disposition** — succeeded, accepted-then-failed, and
  canceled-after-acceptance — following R8·4's acceptance-based table, not the outcome label.
  `jobs.cost_cents` becomes a **derived rollup** over that job's reconciled ledger rows.
- **`reserved_cents = 0` is explicit for `origin IN ('backfill','direct')`.** R6·5 (`0033:578`) declares
  `reserved_cents INT NOT NULL`, and **neither R9·4's backfill row (`0033:1587-1591`) nor R10·3's direct
  row (`0033:1872-1875`) supplied a value** — both would fail the NOT NULL constraint as filed. Eli named
  it for `direct`; **it applies identically to `backfill`, which he did not name.** Zero is also
  semantically right: these rows never held budget, so they must contribute nothing to the `held` sum
  (`0033:1598`), which they now provably do not.
- **R10·3's governing invariant is preserved and sharpened:** every cent recorded against a job appears
  exactly once as a reconciled ledger row, in the period containing the job's `created_at`. It now reads
  over the **rollup**, since `jobs.cost_cents` is derived: per-owner, per-period
  `SUM(jobs.cost_cents) = SUM(actual_cents)` over reconciled rows remains the standing detector.

**Two consequences Eli did not name. Both are mine, both are real, and both were found by tracing R11·7
into the actual §4.2 body rather than accepting the requirement as writable.**

1. **The failure path has no cost channel at all.** `executeClaimed`'s catch writes
   `status='failed', error_code, error_detail` (`worker.ts:77-81`) and **no `cost_cents`**; the thrown
   value reaching it is an `ApiError` carrying only `code` and `httpStatus` (`errors.ts:28-37`), or an
   unclassified error mapped to `INTERNAL` (`errors.ts:43-48`). **A handler that knows the provider
   charged for an accepted-then-failed attempt has no way to report that amount.** R11·7's requirement is
   therefore not implementable on the direct path as the code stands. The fix is a spec-level question,
   not a code choice, so I am filing it rather than picking: either the §4.3 error type gains an optional
   billed-amount field, or the handler writes its own ledger row before throwing. **Flagged for Eli and
   the owner; deliberately not decided here.**
2. **A derived `cost_cents` collides with the verbatim §4.2 write.** `worker.ts:69-71` sets
   `cost_cents=$3` from a single handler result. If `cost_cents` is a rollup over multiple billed
   attempts, that statement **overwrites the rollup with the last attempt's figure**. This lands squarely
   on the existing **OPEN DECISION** below rather than beside it: the §4.2 terminal block needs both an
   added ledger write *and* a changed `cost_cents` expression.

---

**VHE-2 §4.2 OPEN DECISION — Eli's recommendation recorded; the decision remains Ashley's.**

Eli recommends **option (iii): authorize a documented amendment to VHE-2 §4.2**, on the reasoning that the
terminal success block is no longer complete under the authoritative ledger design, that option (i)
stretches the `// BUILDER:` exception past its stated purpose, and that option (ii) still changes the
execution contract while disguising the correction as a wrapper. He adds a binding implementation
constraint that is **independent of which option is chosen**: the terminal update plus ledger writes go in
a **short Postgres transaction**, and **a database transaction is never held open across a provider call.**

**Recorded, not enacted.** The owner decides; I am not choosing a VHE-2 amendment on a reviewer's
recommendation. **Round 11 notes only that R11·7's consequence 2 strengthens the case Eli is making** — the
§4.2 block now needs an added statement *and* a changed expression, which is more than an additive
`// BUILDER:` line naturally covers. That is an argument for the owner to weigh, not a decision.

---

**Administrative decisions returned by Eli (recorded and applied):**

- **Keep the six `.docx` blueprints in future review packages.** This closes handoff 40's carry-over
  question; the convention is unchanged and `13`'s inclusion was correct.
- **Do not create full backup `v09` yet.** Unchanged from round 10; `v08` remains latest.
- **No source tests were required** for the docs-only package `13`.
- **Package provenance is correct** in disclosing that commit claims cannot be cryptographically verified
  from a ZIP without `.git`.
- **`Progress-update 14` is NOT to be built until the round-11 corrections are filed and committed.**

---

**Round-11 added tests** (beyond `0032` §12, §9's seven, r5's seven, r6's six, r7's eight, r8's eight,
r9's eight, r10's ten — round-10 test 10 is retracted and replaced by test 6 here):

1. A follower job parks in **`awaiting_provider_operation`** and is **not** taken over after 120 seconds —
   assert `attempt` unchanged across three takeover windows, and assert it is **never** written to
   `succeeded` by the §4.2 terminal path while parked.
2. A follower is woken on **`submitting → in_flight`** and **issues no provider poll** in any state — assert
   zero provider calls from the follower across the whole lifecycle; the owner or reconciler is the only
   caller.
3. A follower woken by **`submission_unknown`** re-parks as **`waiting`** and **is woken again** by the
   later reconciliation transition to `succeeded` — the round-10 dead end, asserted closed.
4. **Re-adding a BullMQ job whose earlier job under the same custom id has COMPLETED is ignored** (the
   behavior R11·4 rests on and the tree does not currently prove), and a wake enqueued as
   **`wake:{outbox_id}`** is delivered even though the target job's original `{ jobId }` job is completed.
5. A delivery carrying **`wake_kind='resume_provider_follower'`** reaches the follower resume claim, not
   `claimForExecution`; a delivery with an **unknown `wake_kind` fails loudly** and is never treated as
   `execute`.
6. **Replaces round-10 test 10.** With every dispatcher stopped, a parent whose blocking child went
   terminal is **not resumed** and its outbox row **survives undispatched**; when a dispatcher starts, the
   parent resumes **exactly once**. Separately, the sweeper inserts a fresh row for a target whose earlier
   wake was dispatched but ineffective, and inserts **no second undispatched row** while one is pending
   (the partial unique index).
7. A direct-spend job whose **first attempt is accepted then fails** and whose **second attempt succeeds**
   produces **two** `origin='direct'` reconciled rows keyed by `(job_id, execution_attempt)`; the derived
   `jobs.cost_cents` equals their sum, and **both** count against the cap.
8. `origin IN ('backfill','direct')` rows insert successfully with **`reserved_cents = 0`** and contribute
   **nothing** to the `held` sum — asserted against the R9·4/R6·5 queries as written.
9. Canceling a job parked in `awaiting_provider_operation` resolves its follower row and leaves the owning
   operation's state, reservation, and every other follower **byte-for-byte unchanged**.
10. A job in `awaiting_provider_operation` with **no** corresponding follower row is detected by the
    invariant sweep (the R11·1 structural link), rather than waiting silently forever.

---

**Status after round 11:** `0032` (base) + `0033` (binding + rounds 5–11) remain the removal-lane spec.
**STILL NOT build-authorized.** The next gate remains **another specification review — NOT the fal
metadata probe.** Administrative direction applied: round 11 appended only; `0032`, `0033`'s body, and
rounds 5–10 unmodified; **no `Progress-update 14` until this correction is filed and committed**; no
`v09`; nothing probed, keyed, networked, uploaded, or spent.

**Discipline added for round 12 — the check that would have prevented three of these seven:** before
filing, **read the round's own added tests back against the round's own added rules, one at a time, and
assert each test is producible by a rule as written.** R11·2 and R11·6 were both a test asserting behavior
its own rule did not define, and R11·3 was two sections of one round prescribing different actions for the
same input. All three were findable in minutes without leaving the document. This is now a standing
pre-filing step alongside the existing ones (verify every claim against real code with file:line; retract
superseded text by name; re-read prior appends for conflicts).

**What I did / did NOT do (round-11 append):** *Did* — re-read `packages/jobs/worker.ts` (`:35-45` claim +
`RETURNING *`, `:37` attempt increment, `:39-40` takeover predicate, `:68-72` terminal-success write,
`:76` retry ceiling, `:77-81` failure write with no cost, `:83-85` heartbeat `finally`),
`packages/queue/runtime.ts` (`:49` processor payload type, `:54-55`, `:62`, `:66`, `:90-94` guarded
handback), `packages/queue/queues.ts` (`:59-62` `RETRY_POLICY`, `:85` the `{ jobId }` add),
`packages/queue/runtime.test.ts` (`:173-179`, and established what it does **not** prove),
`packages/jobs/errors.ts` (`:28-37` `ApiError` shape, `:43-48` `classifyError`), `packages/jobs/create.ts`
(`:56-68`), and `package.json:20` (`bullmq` 5.80.1); grepped `packages/` for
`removeOnComplete`/`removeOnFail` (**zero hits**) rather than assuming BullMQ's retention default;
re-read R5·5, R6·4, R6·5, R8·1, R8·2, R8·4, R9·4, R9·5, R10·1–R10·4 and the round-10 test list in full and
diffed the rules against the tests; confirmed all seven blockers with file:line; found and filed **five**
consequences Eli did not name — the missing cost channel on the §4.2 failure path, the rollup/verbatim
`cost_cents` collision, `reserved_cents=0` applying to **`backfill`** as well as `direct`, the frozen
claim-time `execution_attempt` key (because `jobs.attempt` is mutable), and the undispatched-only partial
unique index on the outbox (because a blanket key would block the repair it exists to enable); generalized
R8·1's guard predicate to name the exact state each write replaces; recorded Eli's option-(iii)
recommendation **without enacting it**. *Did NOT* — write or change any code; run the test suite (no source
touched — figures remain **153/153 · preflight 13/4/1**, last measured at `52e3277`); run any live BullMQ
or Redis check (explicitly noted where that limits what R11·4 proves); build `Progress-update 14`; cut a
full backup; run the probe; read the fal key; call any provider; touch the network; upload anything; spend
anything; rewrite `0032`, `0033`'s body, or any prior appendix (round 11 appended only); modify VHE-2 or
decide the §4.2 OPEN DECISION; weaken any R9·3 or R10·2 foreign key.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-27

---

### Round-12 correction — Eli blockers on `VHE-Progress-update 14` (2026-07-27, `CC-OPUS-01`)

**Source:** Ashley relayed the reviewer ("Eli") round-twelve verdict on `VHE-Progress-update 14`, reviewed
against the actual ZIP, the complete round-11 append, the prior correction chain, VHE-2, and the unchanged
source seams. **Package audit: PASS**, with every metric independently reproduced — 164 entries,
1,049,701 compressed, 1,961,268 uncompressed, SHA-256
`5F14F62AF4BFC8DFCB8BC9B1E2E1F8E5100B09752730352E41B1E45CFC20EC8E`, **Update 13's complete `0033` an
exact prefix of Update 14's**, `0032` byte-for-byte unchanged, no source changed 13→14. All match the
figures recorded in `CURRENT-STATUS.md` and handoff 42 exactly.

**Verdict: specification REJECTED with eight blockers.**

Instruction recorded: append round 12 to `0033` **only**; preserve `0032`, the `0033` body, and rounds
5–11 exactly; **after the round-12 append and documentation updates are committed, build and verify
`Progress-update 15`**; no full backup `v09`; no implementation or source changes; no fal probe, key
access, network request, provider call, media upload, deployment, or spend.

**All eight blockers are correct.** **Seven of the eight are defects in round 11's own correction** —
including two that are *new* contradictions round 11 introduced while fixing round 10 (R12·5, R12·8), and
one that is a **hard runtime error** my text would have produced on the first execution (R12·1). Rounds
5–11 are preserved above as filed; **round 12 governs where it conflicts with any of them.**

The pattern from round 11 held and is worth stating without softening: **the corrective discipline is
catching real defects but is still not preventing me from introducing new ones at roughly the same rate.**
Round 11 added the "read your own tests against your own rules" check, and round 12's blockers 2 and 8
are exactly the class that check was meant to catch — **round 11 preserved a round-10 test requirement
(`in_flight` wake) that round 11's own new rule made wrong, and left two representations of the same
delivery.** The check was written into the discipline but not actually executed against the round-10 test
list I was carrying forward. That is a process failure, not a knowledge gap, and it is corrected in the
closing discipline below.

---

**R12·1 — `wake:{outbox_id}` is not a valid BullMQ custom job id (fixes R11·4).**

**Correct, and this one is not a design flaw — it is a hard runtime `throw` my specification would have
hit on its first execution.** Verified against the **actually installed** BullMQ, not documentation —
`node_modules/bullmq/dist/cjs/classes/job.js:1049-1051`:

```js
if (this.opts?.jobId.includes(':') && this.opts?.jobId.split(':').length !== 3) {
    throw new Error('Custom Id cannot contain :');
}
```

`wake:{outbox_id}` splits into **2** parts, so `split(':').length !== 3` is true and **`Job.add` throws
`Error('Custom Id cannot contain :')`.** Every wake delivery in R11·4 would have failed at the queue
boundary. The colon is Redis's key separator and BullMQ composes its own key namespace with it.

**Correction — adopt Eli's form exactly.**

- **Delivery id: `wake-{outbox_id}`** (hyphen, not colon).
- **When a later dispatch generation is required (see R12·3): `wake-{outbox_id}-{dispatch_generation}`.**
- **Round-11 test 4 is corrected**: it must assert the delivery id contains **no colon** and is accepted
  by BullMQ, in addition to asserting the completed-job re-add behavior it already covered.

**My addition, not Eli's — do not "fix" this by using a three-part colon id.** The guard above admits a
colon id whose `split(':').length === 3`, so `wake:{outbox_id}:{generation}` would pass today. **It must
not be used.** The two lines immediately above the check in the same file say why:

```js
// TODO: replace this check in next breaking check with include(':')
// By using split we are still keeping compatibility with old repeatable jobs
```

The three-part exemption is **explicitly a legacy-compatibility carve-out that BullMQ has slated for
removal in its next breaking change.** Building the wake-up transport on it would be a deliberate bet on
a deprecation. The hyphen form has no such dependency. **Binding rule: no BullMQ custom job id in this
project ever contains a colon.**

---

**R12·2 — Followers are still woken for states they cannot act on, and the wake creates a lost-wake race
(fixes R11·2).**

**Correct on both halves, and the second half is a genuine race, not just wasted work.** R11·2 established
"followers never poll" and then, in the same section, listed **`in_flight`** and **`submission_unknown`**
in the wake set. A follower woken in either state can do exactly one thing — park again. Worse, the
round-trip is not free of consequence:

1. the follower is woken and its resume claim moves it `awaiting_provider_operation → running`;
2. while it is transiently `running`, the operation reaches a terminal state and fires the **terminal**
   wake;
3. that wake's resume claim (`WHERE id=$1 AND status='awaiting_provider_operation'`, R11·1) matches
   **zero rows**, because the follower is `running` at that instant;
4. the terminal wake is consumed and lost, and the follower's resume depends entirely on the sweeper.

**The `in_flight` wake I added in round 11 therefore creates the exact lost-wake dependency round 10's
outbox existed to remove.**

**Correction — a follower is woken only when an actionable outcome exists.**

- **The `in_flight` wake requirement is RETRACTED.** A follower stays parked through `in_flight` and
  through `submission_unknown`.
- **Round-11 test 2 is corrected** to assert followers remain parked through both states and make **zero**
  provider calls.
- **Round-10 test 1 is now retracted in full, explicitly.** Round 11 retracted the *rule* that a follower
  polls but preserved the *test* requiring a wake at `submitting → in_flight`, then wrote the rule to
  satisfy the stale test. **Eli's point is exact: the round-10 test was wrong and must not survive
  indirectly through a rule shaped to honor it.** This is the precise failure the round-11 discipline was
  supposed to prevent, applied to a test I inherited rather than one I wrote that round.
- **The actionable wake set, complete and final:**
  - operation **`succeeded`** → reuse `result_key`, zero spend, attachment resolved;
  - proven **`preaccept_rejected`** or **confirmed-no-job** → begin a **new funded routing walk** per
    R12·5 below;
  - **accepted-then-failed / canceled-after-acceptance** → reconcile the charge per R8·4, then fail, or
    await an **explicitly authorized** retry (R6·4). No automatic fall-through (R11·3, unchanged);
  - **final reconciliation outcome** for an operation that was `submission_unknown`.

**Operation-level polling ownership — Eli's question, answered rather than deferred.** R11·2 assigned
polling to "the owning job or the reconciler" without saying what happens when the owning job is canceled
or otherwise becomes terminal while its operation is still `accepted`/`in_flight`. As filed, its followers
would park forever.

- **Binding rule: an accepted provider operation is never orphaned by its owner's death.** When the owning
  job reaches any terminal state (`succeeded`, `failed`, `canceled`) while its operation is still
  `accepted` or `in_flight`, the operation is **adopted by the operation-level reconciler**, which becomes
  its polling owner. Adoption is a state transition on the operation, recorded with the adopting
  reconciler's lease, and is itself an outbox-eligible event.
- The reservation is **untouched** by adoption — it stays `held` exactly as R6·5/R8·4 require, because
  acceptance was proven and the charge is still unresolved.
- Followers of an adopted operation remain `waiting`; their wake comes from the reconciler's terminal or
  reconciliation outcome, on the same actionable-only set above.

---

**R12·3 — `dispatched_at` does not prove a wake was consumed (fixes R11·6).**

**Correct.** My R11·6 partial index `UNIQUE (target_job_id, wake_kind) WHERE dispatched_at IS NULL`
deduplicates **pending** intent and then stops protecting anything the instant the dispatcher stamps
`dispatched_at`. At that moment the wake may be waiting in Redis, delayed by backoff, active, or
completed **without winning the database claim** — and the outbox cannot tell those apart. A sweeper that
treats "dispatched" as "handled" under-repairs; one that treats a still-parked target as "needs another
row" inserts a new row **every sweep cycle**. I specified the index without specifying what makes it safe
to insert again.

**Correction — a durable delivery lifecycle, so "dispatched" and "consumed" are different facts.**

`job_wakeup_outbox` gains:

- **`dispatch_generation INT NOT NULL DEFAULT 0`** — incremented on each reissue; feeds
  `wake-{outbox_id}-{dispatch_generation}` (R12·1) so a reissue is a genuinely new BullMQ job.
- **`dispatch_lease_expires_at TIMESTAMPTZ NULL`** — set when the dispatcher enqueues.
- **`dispatched_at TIMESTAMPTZ NULL`** — unchanged in meaning: *handed to the queue*, nothing more.
- **`consumed_at TIMESTAMPTZ NULL`** — the acknowledgment that a worker actually **won** the resume claim.
- **`dispatch_error TEXT NULL`** and **`dispatch_attempts INT NOT NULL DEFAULT 0`** (retained from R10·4).

**Binding rules:**

- **The worker writes `consumed_at` in the SAME Postgres transaction as the successful resume claim.**
  Both are Postgres, so this atomicity is real — the distinction round 10 got wrong and round 12 must not
  repeat. A delivery that loses the claim never marks itself consumed.
- **The sweeper may reissue ONLY when a delivery is unconsumed AND its dispatch lease has expired** —
  never merely because `dispatched_at IS NOT NULL`. Reissue increments `dispatch_generation` on the
  **same** outbox row rather than inserting a new one, so the row remains the single durable record of
  that wake-up intent.
- **The R11·6 partial unique index is corrected** to cover the whole un-finished lifecycle:
  **`UNIQUE (target_job_id, wake_kind) WHERE consumed_at IS NULL`**. Pending *and* in-flight-but-unconsumed
  intent is deduplicated; a genuinely new wake-up after a consumed one is always permitted. R11·6's
  `WHERE dispatched_at IS NULL` form is **RETRACTED**.

---

**R12·4 — A crash after the resume claim strands the job, and the ordinary takeover recovers it wrongly
(fixes R11·1).**

**Correct, and it is the same class of gap R9·5 and R11·1 each closed one layer higher — I closed the
"never `running` without an owner" hole for the *parked* state and reopened it for the *resumed* state.**
Concretely, against real code:

- R11·1's resume claim moves `awaiting_provider_operation → running` **without** incrementing `attempt`
  (correct, and unchanged).
- If the worker then crashes before re-parking or completing, the job sits at `running`.
- A retried `resume_provider_follower` delivery **cannot** reclaim it: the resume predicate admits only
  `status='awaiting_provider_operation'`.
- The only thing that *can* claim it is `claimForExecution` (`worker.ts:35-45`), which admits a stale
  `running` row — but it **increments `attempt`** (`worker.ts:37`, burning the paid-attempt ceiling
  `worker.ts:76` tests) and hands the row to the ordinary execution path, which for a follower job means
  **the initial-submit branch.** A crashed follower could resubmit and pay twice.

**Correction — the continuation kind is durable, and stale takeover is defined per resume mode.**

- **`jobs` gains a durable continuation marker** (additive, alongside the R9·5/R11·1 states) recording
  which continuation is active: **`resume_children`**, **`resume_provider_follower`**,
  **`resume_reconciliation`**, or none. It is written in the **same transaction** as the resume claim and
  cleared in the same transaction as the re-park or the terminal write.
- **A stale continuation takeover is a distinct operation from `claimForExecution`.** It must:
  1. **reclaim only the matching continuation** — a `resume_provider_follower` takeover can never claim a
     row whose active continuation is `resume_children` or none;
  2. **preserve the execution mode** — it re-enters the continuation, never the initial-submit branch;
  3. **not increment the paid-attempt counter** — a takeover of a continuation is not a new paid attempt,
     for the same reason R9·5's resume was not;
  4. **never fall into an initial-submit branch** under any predicate.
- **This does not weaken `claimForExecution`.** The verbatim §4.2 claim keeps its exact semantics for
  ordinary execution; the continuation takeover is an additive, separately-named path in BUILDER-owned
  code, following the `0017` precedent.
- **Required test (Eli's, adopted): a crash after the resume claim and before handler completion recovers
  through the same continuation mode, with `attempt` unchanged.**

---

**R12·5 — A follower cannot "acquire a fresh reservation" on its existing routing attempt — the rule is
unimplementable against R8·6 (fixes R11·3, and R10·2 before it).**

**Correct, and it is a direct contradiction with a constraint I filed four rounds ago and then reasoned
past twice.** R11·3 (inheriting R10·2's consequence rule) says a follower continuing after a proven
`preaccept_rejected` must **acquire a fresh reservation**. But R8·6 (`0033:1324-1326`) mandates:

```
CREATE UNIQUE INDEX budget_reservations_routing_uniq ON budget_reservations (routing_attempt_id);
```

— explicitly **"full, not partial: a `released` row must still block a second reservation for the same
walk,"** with the stated reason that a re-reservable released walk "could be re-reserved and re-submitted,
recreating the double-charge by a different route" (the same reasoning at `0033:980-985` for the
attempt-level index). **A follower whose reservation was released at attach time therefore cannot obtain
another one against that same routing attempt — the database is designed to forbid exactly that.** Both
rules are individually right; together they are unimplementable, and R8·6's is the one that must win
because it is the double-charge guard.

**Correction — the continuation mints a NEW routing attempt for the remaining chain. It never re-reserves
the old walk.**

In one transaction, a follower continuing after a proven `preaccept_rejected` (or a confirmed-no-job
outcome):

1. **mints a new deterministic `routing_attempt_key`** — derived from the job, the original decision key,
   and the continuation generation, so a double-delivered continuation collapses at the database exactly
   as R8·6's claim-on-insert does today;
2. **snapshots only the eligible remaining candidates** — the chain minus everything already proven
   rejected, so R5·6's conservative chain-maximum is computed over what actually remains rather than the
   original chain;
3. **acquires exactly one new reservation against that new routing attempt** — satisfying
   `budget_reservations_routing_uniq` without touching the old row;
4. **atomically repoints `job_execution_bindings`** to the new routing attempt (the R9·4 rerun mechanism,
   reused unchanged — the job is not executable at any intermediate point);
5. **resolves the old follower attachment** (R12·6's `resolved` terminal state).

- **The old routing attempt and its released reservation are never reopened, re-reserved, or mutated.**
  They remain as immutable history.
- **The cap can still legitimately refuse the new reservation** — R10·2's consequence rule survives
  intact: a follower that cannot fund the remaining chain fails with the standard budget error rather
  than proceeding unfunded.
- **R11·3's phrase "after acquiring a fresh reservation" is RETRACTED** as written and replaced by "after
  minting a new routing attempt and acquiring its reservation," per the five steps above.

---

**R12·6 — The follower table's primary key forbids a job from ever following the same operation twice
(fixes R10·2).**

**Correct.** R10·2's `PRIMARY KEY (provider_operation_id, follower_job_id)` was chosen to make attachment
idempotent under retry, and it does — but it makes the pair unique for the **entire history of the
project**, not for one active attachment. A later rerun or a R12·5 continuation walk by the **same job**
can legitimately meet the **same durable provider operation** again (operations are permanent per R6·4's
`(provider_connection_id, cache_key)` uniqueness). At that point: reusing the resolved row destroys its
earlier routing-attempt history, and inserting a second row violates the primary key. **The design has no
legal move.**

**Correction — every attachment gets its own durable identity; only *active* attachments are constrained.**

`provider_operation_followers` becomes:

- **`id TEXT PRIMARY KEY`** (ULID, matching the project's TEXT-ULID convention)
- `provider_operation_id TEXT NOT NULL REFERENCES provider_operations(id)`
- `follower_job_id TEXT NOT NULL REFERENCES jobs(id)`
- `follower_routing_attempt_id TEXT NOT NULL`
- `state TEXT NOT NULL CHECK (state IN ('waiting','resolved'))` — the two-state set R11·2 established
  (`parked` remains retracted)
- `attached_at`, `updated_at`
- **composite FK `(follower_routing_attempt_id, follower_job_id) → routing_attempts (id, job_id)`** —
  **unchanged from R10·2 and NOT weakened**; the follower's recorded walk must still belong to the
  follower itself
- **`CREATE UNIQUE INDEX ... ON provider_operation_followers (provider_operation_id, follower_job_id)
  WHERE state='waiting';`** — **at most one ACTIVE attachment** per job per operation, which is the
  invariant R10·2 actually wanted. Idempotency under retry is preserved; history is not destroyed.
- **`R10·2's composite primary key is RETRACTED.**

**The parked job links to the exact attachment, not to a pair.** R11·1's structural link is corrected:
the `awaiting_provider_operation` job references the **`provider_operation_followers.id`** of its active
attachment, so a resumed follower can never be matched to a stale attachment from an earlier walk.
**Resolved attachment history is immutable** — rows are never updated after reaching `resolved` except by
the reconciliation that resolved them.

---

**R12·7 — The direct-ledger key is still an alternative, not a schema (fixes R11·7).**

**Correct, and it is a drafting failure rather than a design one — I wrote a choice where an
implementer needs a decision.** R11·7 says "the provider charge / provider operation attempt identifier
when one exists; otherwise `(job_id, execution_attempt)`." Two candidate keys with a runtime condition
between them is not an implementable primary grain.

**Correction — one primary grain, with the charge identifier as a secondary guard.**

- **Primary grain (single, unconditional): `UNIQUE (job_id, execution_attempt) WHERE origin='direct'`.**
- **`execution_attempt INT`** — the **claim-time frozen** value from the row returned by the claim
  (`worker.ts:35-45` `RETURNING *`), never a live read of `jobs.attempt` (R11·7's reasoning, unchanged
  and still load-bearing given `worker.ts:37`).
- **`provider_charge_id TEXT NULL`** — recorded whenever the provider exposes a stable charge identifier.
- **Secondary guard: a partial unique index on `provider_charge_id` where it is non-null**, so the same
  provider-side charge can never enter the ledger twice by two different routes.
- **Explicit null/non-null CHECKs per origin**, so the three origins are structurally distinguishable
  rather than distinguished by convention:
  - `origin='reservation'` ⇒ `routing_attempt_id IS NOT NULL`, `execution_attempt IS NULL`
  - `origin='backfill'` ⇒ `routing_attempt_id IS NULL`, `execution_attempt IS NULL`, `reserved_cents = 0`
  - `origin='direct'` ⇒ `routing_attempt_id IS NULL`, `execution_attempt IS NOT NULL`,
    `reserved_cents = 0`
- **`reserved_cents = 0` for both `backfill` and `direct`** — unchanged from R11·7, restated here so the
  CHECK list is complete in one place.

---

**R12·8 — The queue payload is still two contracts, not one (fixes R11·5).**

**Correct, and I introduced it while fixing R11·5.** Round 11 added `execute` to the `wake_kind` closed
set **and** kept `{ jobId }` as the execute payload shape to protect §4.1's verbatim
`add(type, { jobId }, { jobId })` line. That leaves initial execution representable **two ways**, which is
precisely the ambiguity R11·5 existed to remove.

**Correction — one discriminated union, adopted verbatim as Eli specified it:**

```ts
type QueueDelivery =
  | {
      kind: "execute";
      jobId: string;
    }
  | {
      kind: "wake";
      targetJobId: string;
      wakeKind:
        | "resume_children"
        | "resume_provider_follower"
        | "resume_reconciliation";
      outboxId: number;
      dispatchGeneration: number;
    };
```

**Binding rules:**

- **`execute` is NOT a `wake_kind`** and is never stored in the outbox. The outbox carries continuations
  only; the `wake_kind` set is exactly the three `resume_*` values. **R11·5's four-value set including
  `execute` is RETRACTED.**
- **Unknown delivery shapes and unknown wake kinds fail loudly** — never a silent fallback to `execute`,
  never a drop.
- **A wake delivery selects its claim solely from the discriminant and `wakeKind`**, never from mutable
  job status (R11·5's rule, preserved).
- **The queue name is derived from the authoritative `jobs.type` row**, or `target_job_type` is
  structurally tied to it by composite foreign key. **An unbound copied queue name is never trusted** —
  R10·4's `target_job_type` as a free-standing TEXT column is corrected accordingly.
- **`dispatchGeneration` is carried in the payload** so a reissued delivery (R12·3) is self-describing.

**Note on the §4.1 verbatim line, since that is why round 11 hedged.** §4.1's
`await queues[type].add(type, { jobId }, { jobId })` remains **untouched**: its payload `{ jobId }` is the
`execute` arm minus the discriminant, and adding `kind: "execute"` is the one change required. Whether
that counts as adapting the verbatim line is **now moot** — the owner has authorized a documented §4.2
amendment (below), and the same documented-amendment mechanism covers this §4.1 payload adjustment.
**Flagged explicitly rather than assumed:** the amendment Ashley authorized was scoped to §4.2, so the
§4.1 payload change is recorded here as **requiring the same authorization**, and is listed in the pending
blueprint-amendment work below rather than treated as already covered.

---

**OWNER DECISION — VHE-2 §4.2: option (iii) AUTHORIZED (closes the round-10 OPEN DECISION).**

**Ashley authorizes option (iii): a documented amendment to VHE-2 §4.2.** This closes the open decision
carried since round 10. Recorded with the reviewer's accompanying design ruling, which is adopted:

**A typed execution failure/result contract — not an independent handler-side ledger write.** The typed
failure carries:

- the **frozen claim-time `execution_attempt`**;
- **provider and operation references**;
- **submission disposition**: `preaccept_rejected` | `accepted` | `ambiguous`;
- **charge state**: `none` | `known` | `unknown`;
- **known `cost_cents`** when available;
- **retryability** and the §4.3 **machine error code**.

**Rules, binding:**

- A **known billed failure** is written to the ledger **before** retrying or terminating.
- **`accepted` or `ambiguous` with unknown cost** enters reconciliation and **never auto-retries**.
- A **proven pre-acceptance failure with no charge** follows the ordinary retry/fall-through rule.
- **`jobs.cost_cents` is recomputed from the reconciled ledger sum.** The existing terminal assignment
  `cost_cents=$3` (`worker.ts:69-71`) **is amended and must never overwrite the rollup** — this is
  exactly the collision round 11 flagged as consequence 2, and the amendment resolves it.
- **Terminal state write, ledger write, and rollup update occur in ONE short Postgres transaction.**
- **No database transaction is ever held open across provider submission, polling, download, or any other
  network call.**

**This also resolves round 11's other open finding** — the §4.2 failure path having no cost channel at all
(`worker.ts:77-81` writes no `cost_cents`; `ApiError` at `errors.ts:28-37` carries only `code` and
`httpStatus`). The typed contract **is** that channel.

**What I did NOT do, deliberately, and what remains pending.** **I have not edited
`VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx`.** The authorization is recorded; the document edit is a
separate, deliberate act and I am not performing it unilaterally in the same breath as recording it,
for three stated reasons:

1. `CLAUDE.md` and `_LOGS/README.md` both declare **VHE-1 through VHE-4 intact and not to be modified**.
   That standing instruction is now superseded **for §4.2 specifically**, but superseding a
   project-wide "do not modify" rule is the kind of thing that should happen once, explicitly, with the
   owner watching — not as a side effect of filing a correction.
2. Eli's own round-12 instruction is **"Append round 12 to `0033` only"** plus documentation updates.
   A blueprint edit is neither.
3. The edit has a **mandatory companion step**: `python _BLUEPRINTS-TEXT/_regenerate.py` must be rerun in
   the same session (project rule), and the `.docx` is binary — a botched edit is not trivially
   reviewable in a diff.

**Pending blueprint-amendment work, for Ashley to green-light as its own task:**
(a) amend **VHE-2 §4.2** per the typed-contract rules above; (b) amend the **§4.1 payload line** to carry
the `kind: "execute"` discriminant (R12·8); (c) rerun `_BLUEPRINTS-TEXT/_regenerate.py` in the same
session; (d) record the amendment as its own numbered issue-log entry (**`0034`**), since a blueprint
change is exactly the kind of event the diary exists for.

---

**Round-12 tests** (Eli's ten, adopted; they supersede the corrected round-10/round-11 tests named above):

1. The valid **non-colon** wake id (`wake-{outbox_id}`) is accepted by BullMQ — and the colon form is
   asserted to **throw**, pinning the behavior verified at `job.js:1049-1051`.
2. Followers remain **parked** through `in_flight` **and** `submission_unknown` and make **zero** provider
   calls (replaces round-11 test 2 and finally retires round-10 test 1).
3. A canceled or stale operation owner is **replaced by an operation-level poll/reconciliation owner**;
   its followers do not park forever, and the reservation stays `held` across adoption.
4. A **dispatched but unconsumed** wake is **not duplicated** before its lease expires, and **is reissued**
   after expiry with an incremented `dispatch_generation` and therefore a new delivery id.
5. A **crash after a resume claim** recovers through the **same continuation mode**, without incrementing
   the paid-attempt counter and without entering the initial-submit branch.
6. A follower continuation **creates a new routing attempt and reservation**, and **cannot** reserve twice
   against the old walk (asserted against `budget_reservations_routing_uniq` at the database).
7. **Two resolved attachment histories** for the same job/operation but different routing attempts
   **coexist**, while a second **`waiting`** attachment for that pair is rejected.
8. An **accepted-then-failed direct attempt records its known charge before retry**; an **unknown**
   accepted charge **parks for reconciliation** and does not auto-retry.
9. **`jobs.cost_cents` equals the sum of all reconciled ledger rows** after multiple attempts.
10. **Wrong queue-type binding** and **unknown payload/wake kinds are rejected** — loudly, never silently
    defaulted.

---

**Status after round 12:** `0032` (base) + `0033` (binding + rounds 5–12) remain the removal-lane spec.
**STILL NOT build-authorized.** Per Eli's round-twelve direction: append round 12 only; **after this
append and the documentation updates are committed, build and verify `Progress-update 15`**; no `v09`; no
implementation, source change, probe, key access, network request, provider call, upload, deployment, or
spend. **The §4.2 amendment is AUTHORIZED but NOT YET APPLIED to the blueprint** — see the pending work
above; it wants its own entry (`0034`) and Ashley's direct go.

**Discipline correction for round 13 — the round-11 check existed and I did not run it on inherited
tests.** Round 11 added "read the round's own added tests back against the round's own added rules."
Round 12's blocker 2 is a **round-10** test that round 11's new rule contradicted, and round 11 reshaped
the *rule* to satisfy the stale *test* instead of retracting the test. **The check is hereby widened: read
the round's new rules against the ENTIRE live test list — every prior round's tests included — and
explicitly retract by number any test a new rule invalidates.** A test surviving from an earlier round is
not evidence it is still correct; it is the most likely place for a silent contradiction to hide.

**What I did / did NOT do (round-12 append):** *Did* — verify blocker 1 against the **actually installed**
BullMQ source (`node_modules/bullmq/dist/cjs/classes/job.js:1049-1051`), not documentation, and read the
two comment lines above it establishing that the 3-part colon exemption is a legacy carve-out slated for
removal (filed as my own note, so no future round "fixes" this by using a 3-part colon id); confirm the
R11·3 ↔ R8·6 contradiction by reading R8·6's index text at `0033:1324-1326` and its stated
double-charge reasoning at `0033:980-985`; re-read `worker.ts:35-45`, `:37`, `:69-71`, `:76`, `:77-81`,
`errors.ts:28-37`, and round 11's own R11·1–R11·7 to confirm blockers 2, 4, 7, 8; record the owner's
authorization of §4.2 option (iii) with its full typed-contract ruling; **flag that the §4.1 payload
change needs the same authorization rather than assuming the §4.2 grant covers it**; retract by name
R10·2's composite PK, R11·2's `in_flight` wake, R11·3's "fresh reservation" phrase, R11·5's four-value
`wake_kind` set, R11·6's `dispatched_at` index predicate, and **round-10 test 1 in full**. *Did NOT* —
**edit VHE-2 or any blueprint `.docx`** (authorization recorded, edit deliberately deferred to its own
task with Ashley's direct go); write or change any code; run the test suite (no source touched — figures
remain **153/153 · preflight 13/4/1**, last measured at `52e3277`); run any live BullMQ/Redis check
(the `job.js` verification is a **source read**, not an execution); build `Progress-update 15` (that comes
after this is committed); cut a full backup; run the probe; read the fal key; call any provider; touch the
network; upload anything; spend anything; rewrite `0032`, `0033`'s body, or any prior appendix (round 12
appended only); weaken any R9·3, R10·2, or R12·6 foreign key.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-27

---

### Round-13 correction — Eli blockers on `VHE-Progress-update 15` (2026-07-27, `CC-OPUS-01`)

**Source:** Ashley relayed the reviewer ("Eli") round-thirteen verdict on `VHE-Progress-update 15`.
**Package audit: PASS**, with the strongest independent verification yet: 167 entries, 1,078,864-byte ZIP,
2,034,859 uncompressed, SHA-256 `AD95378016F537D167371EEBB7E3E8BADBB658DEEDBFB00D1FAB78CDEACED971`,
**Update 14's complete `0033` an exact byte-prefix of Update 15's**, `0033` grown **2,435 → 2,916 lines =
exactly 481 appended lines with zero prior-line changes**, `0032` byte-for-byte unchanged, **all blueprint
`.docx` files unchanged**, no `packages/`/`scripts/`/`migrations/` source changed, and the round-12
stale-provenance mistake confirmed corrected. Packaging is clean.

**Verdict: specification REJECTED with seven blockers.** Round 12's eight targets are "mostly moving in the
correct direction," but seven implementation-level gaps or contradictions remain.

Instruction recorded: append round 13 to `0033` **only**; preserve `0032`, the `0033` body, and rounds
5–12 exactly; update the normal logs and handoff; **build `Progress-update 16` only after the round-13
append and documentation changes are committed**; no source implementation, blueprint modification,
probe, key access, network/provider call, upload, deployment, or spend; no full backup `v09`.

**All seven blockers are correct**, and each was verified at the exact line cited rather than accepted on
trust. **The shape of this round is different from 11 and 12, and that is worth naming honestly:** these
are not contradictions between round 12 and reality so much as **places where round 12 wrote a rule that
sounds complete and is not implementable as written** — an undefined term used exactly once (R13·2), a
transaction with no failure branch (R13·3), a uniqueness guard with no namespace (R13·5), a type that
cannot hold its own values (R13·6), and — twice — **an "or" where an implementer needs a decision**
(R13·1's adoption predicate, R13·7's queue binding). **R13·7 is the same defect R12·7 corrected, committed
again a few paragraphs later in the same append.**

---

**R13·1 — The operation-level reconciler has no complete ownership contract (fixes R12·2).**

**Correct, and the contradiction is inside round 12's own append.** Verified at both cited sites:

- `0033:2553-2555` (R12·2's binding rule): *"When the owning job reaches any **terminal** state
  (`succeeded`, `failed`, `canceled`) while its operation is still `accepted` or `in_flight`, the
  operation is **adopted by the operation-level reconciler**."*
- `0033:2864-2865` (round-12 **test 3**): *"A **canceled or stale** operation owner is replaced by an
  operation-level poll/reconciliation owner."*

**A stale owner is not a terminal owner.** A worker that dies mid-poll leaves its job `running` with a
dead heartbeat — the exact case R9·5 and R12·4 exist for — and R12·2's predicate never fires for it. The
test requires an adoption the rule cannot perform. **This is the third consecutive round in which a test
of mine asserts behavior my own rule does not produce.**

R12·2 also says adoption is *"recorded with the adopting reconciler's lease"* and is *"itself an
outbox-eligible event"* — but **no reconciler identity, no lease columns, no adoption predicate, and no
delivery target were ever defined.** An outbox row requires a `target_job_id`; after the original owner is
terminal there is no job to target.

**Correction — a durable reconciler owner with an explicit two-predicate adoption.**

- **`provider_operations` gains reconciler-ownership columns** (additive):
  - `reconciler_owner_id TEXT NULL` — the durable identity of the adopting reconciler instance;
  - `reconciler_lease_expires_at TIMESTAMPTZ NULL`;
  - `reconciler_adopted_at TIMESTAMPTZ NULL`;
  - `reconciler_generation INT NOT NULL DEFAULT 0` — incremented on every adoption or takeover, so a
    zombie reconciler's write can be rejected by generation.
- **Two adoption predicates, both explicit — an operation is adoptable when its acceptance is proven
  (`accepted` or `in_flight`) AND either:**
  1. **terminal owner** — the owning job is in a terminal state (`succeeded`, `failed`, `canceled`); or
  2. **stale owner** — the owning job is `running` with `heartbeat_at < now() - interval '120 seconds'`,
     the same staleness predicate the §4.2 takeover uses at `worker.ts:39-40`, reused deliberately so
     there is exactly one definition of "stale" in the system.
- **Single-winner adoption is a compare-and-swap**, in the R8·1/R9·5 guarded-write idiom:
  `UPDATE provider_operations SET reconciler_owner_id=$1, reconciler_lease_expires_at=now()+$lease,
  reconciler_adopted_at=now(), reconciler_generation=reconciler_generation+1 WHERE id=$2 AND
  (reconciler_owner_id IS NULL OR reconciler_lease_expires_at < now()) AND <adoption predicate>
  RETURNING reconciler_generation` — **zero rows means another reconciler won; the loser does nothing.**
- **Lease renewal and takeover:** the owning reconciler renews by extending
  `reconciler_lease_expires_at` guarded on `reconciler_owner_id` **and** `reconciler_generation`
  (so a reconciler whose lease already expired and was taken over cannot renew itself back into
  ownership). An expired lease is adoptable by the same CAS above — takeover is not a separate mechanism.
- **Which delivery starts polling — the gap that made "outbox-eligible" meaningless.** The outbox targets
  **jobs**, and after a terminal owner there is no job to target. **Correction: reconciler polling is
  NOT driven by the job outbox.** It is driven by the reconciler's own scan over adoptable operations
  (the predicate above), which is a durable database query needing no queue delivery at all.
  **R12·2's "adoption is itself an outbox-eligible event" is RETRACTED** — it described a delivery that
  had no addressable target.
- **How followers are eventually woken — unchanged and now actually reachable:** when the reconciler
  resolves the operation to any actionable outcome (R12·2's set), it writes the operation's state and the
  **per-follower outbox rows in the same Postgres transaction**, exactly as R10·2/R12·3 specify. Those
  rows target the **follower jobs**, which do exist and are addressable. The reconciler needs no outbox
  row of its own.
- **The reservation stays `held` across adoption** (R12·2, unchanged) — acceptance was proven and the
  charge is unresolved, per R6·5/R8·4.

---

**R13·2 — "Continuation generation" is used once and defined nowhere (fixes R12·5).**

**Correct, and decisively so.** `grep` over the whole 2,916-line entry returns **exactly one occurrence**
of the phrase — `0033:2666`, its only use:

> *"mints a new deterministic `routing_attempt_key` — derived from the job, the original decision key,
> and the continuation generation…"*

**The only generation defined anywhere in the spec is `dispatch_generation`** (R12·3), which increments
**every time the same queue delivery is reissued.** Eli's consequence is exact and I confirmed the
reasoning: if an implementer reached for the only defined generation, **a redelivery of one logical
continuation would mint a *different* `routing_attempt_key`** — destroying the very collapse-at-the-
database guarantee step 1 exists to provide, and producing two funded routing attempts for one logical
continuation. **A term used once and never defined is not a specification; it is a placeholder I left in.**

**Correction — a separate durable logical `continuation_generation`.**

- **`jobs` gains `continuation_generation INT NOT NULL DEFAULT 0`** (additive).
- **It is incremented exactly once per new *logical* continuation** — when a follower decides to continue
  its walk — **never per queue delivery, never per dispatch retry.**
- **It is stored on the job, not on the follower attachment** — a deliberate choice, for the same reason
  R12·4's continuation marker lives there: a job has at most one active continuation at a time, and
  co-locating the two means one row carries the whole continuation identity and they cannot drift apart.
  The exact follower attachment is already reachable from the job via R11·1/R12·6's structural link.
- **`routing_attempt_key` = f(job_id, original decision key, `continuation_generation`)** — deterministic,
  so **every delivery of one logical continuation computes the same key** and R8·6's
  `ON CONFLICT (routing_attempt_key) DO NOTHING` collapses the duplicate at the database.
- **`dispatch_generation` never appears in any routing or reservation key.** Binding rule, stated so the
  two can never be conflated again: **`dispatch_generation` identifies a delivery attempt;
  `continuation_generation` identifies a logical continuation. Only the latter may enter a durable
  business key.**

---

**R13·3 — R12·5's five-step transaction has no failure branch (fixes R12·5).**

**Correct, and Eli's closing sentence identifies the real hazard precisely.** `0033:2678-2680` says the cap
*"can still legitimately refuse the new reservation"* and the follower *"fails with the standard budget
error"* — but the five steps at `0033:2665-2675` describe only the success path. Left there, the obvious
implementation is "run the transaction; if the reservation fails, roll back" — and **a rollback undoes the
`consumed_at` write too**, leaving a delivery that was consumed in Redis and un-consumed in Postgres,
attached to a follower still sitting in `waiting`. The wake is gone and the follower waits forever.

**Correction — the continuation transaction has two commit shapes and never rolls back to nothing.**

The reservation attempt happens **first**, and exactly one of these commits:

**(A) Funded** — reservation acquired: proceed with R12·5 steps 1–5 as filed, plus `consumed_at` on the
delivery (R12·3).

**(B) Refused** — reservation refused by the cap. **All of the following commit atomically, in one
transaction:**
1. **no new `job_execution_bindings` row is installed** — the job is never repointed at an unfunded walk;
2. **no unfunded routing attempt becomes executable** — if a routing-attempt row was inserted before the
   refusal was known, it is left **non-executable** (nothing binds to it) and is not deleted, preserving
   the deterministic-key history that makes a retry collapse rather than double-mint;
3. **the old follower attachment is resolved** (R12·6 `resolved`) — no attachment is left `waiting`;
4. **the job becomes `failed` with `BUDGET_EXCEEDED`** (`errors.ts:12`, the existing §4.3 code), written
   under the R8·1 guarded discipline naming the exact state it replaces (R11·1);
5. **the active continuation marker (R12·4) is cleared**;
6. **`consumed_at` is written on the delivery** (R12·3) — the wake was genuinely consumed; it must not be
   reissued into a now-terminal job.

- **Binding rule: `consumed_at` and the outcome of the work the delivery triggered always commit
  together, in both branches.** A rollback that discards the outcome must also discard the consumption —
  which is why branch (B) is a **commit**, not a rollback.
- **Only an infrastructure failure (crash, connection loss) rolls the transaction back entirely** — and
  that case is correct, because nothing was consumed and the R12·3 lease expiry reissues the wake.

---

**R13·4 — The direct-ledger grain rests on an unstated assumption (fixes R12·7).**

**Correct, and verified against the already-built code rather than reasoned about abstractly.**
`UNIQUE (job_id, execution_attempt) WHERE origin='direct'` permits exactly one direct charge row per
claimed execution attempt. But `walkChain` (`packages/providers/routing.ts:115-136`) **loops the entire
eligible chain inside a single call**:

```ts
for (const connection of chain) {
  const step = await attempt(connection);
  if (step.ok) return { connection, result: step.result, failures };
  failures.push({ ... });
}
```

One `execution_attempt` therefore **can** touch several provider connections, and — for the direct path —
several potentially billable operations. The grain is only correct if something guarantees the first
billed disposition ends the attempt, and round 12 never said that.

**Correction — option 1: ledger by provider attempt.**

- **`UNIQUE (job_id, execution_attempt, provider_attempt_no) WHERE origin='direct'`**, where
  `provider_attempt_no INT` is the ordinal of the candidate within that execution attempt's chain walk
  (0-based, in `walkChain` iteration order).
- `provider_attempt_no` is **NOT NULL for `origin='direct'`** and NULL for `reservation`/`backfill`, added
  to the per-origin CHECK list from R12·7.
- **Why option 1 and not option 2 — the reason is in the shipped code, and this is my judgment call, made
  explicitly rather than silently.** Option 2 (prohibit same-attempt fall-through after any billed or
  accepted disposition) is the cleaner rule *for the removal lane*, where R5·5 already restricts
  fall-through to a proven `preaccept_rejected` — which is by definition unbilled. But **the
  `origin='direct'` path exists precisely for the NON-routed, already-built lanes** (§9.1 OpenAI, §9.2 fal
  `image.inpaint`), and those bill through `worker.ts:68-72` using this same generic `walkChain`, which
  falls through on **any** failure including a potentially billed one. Adopting option 2 would require
  changing the fall-through behavior of **already-shipped, already-tested §7 code** — scope growth into
  built code, which needs its own work order and its own review, not a line in a spec correction.
  **Option 1 records reality; option 2 changes it.** Option 2 remains available later as a deliberate
  tightening, and is named here so a future round can choose it knowingly.
- **The R11·7/R12·7 invariant is preserved** — `jobs.cost_cents` is the derived rollup over all reconciled
  rows for the job, which now simply sums more rows in the multi-candidate case.

---

**R13·5 — `provider_charge_id` is not namespaced (fixes R12·7).**

**Correct.** `0033:2739` specifies *"a partial unique index on `provider_charge_id` where it is
non-null."* On the column alone, that asserts a **global charge-identifier namespace across every
provider and every connected account** — and two providers can both legitimately issue charge `12345`.
The guard would reject a perfectly valid second row, or (worse, depending on insert order) silently treat
two unrelated charges as one.

**Correction — scope the guard to the issuing provider connection.**

- **`UNIQUE (provider_connection_id, provider_charge_id) WHERE provider_charge_id IS NOT NULL`.**
- **The ledger row carries `provider_connection_id`** — the identity that makes the charge id
  interpretable. This is the same `provider_connections(id)` the rest of the spec already keys on
  (R6·4's `(provider_connection_id, cache_key)` operation uniqueness), so no new concept is introduced.
- **`provider_connection_id` is NOT NULL whenever `provider_charge_id` is NOT NULL**, added to the
  per-origin CHECK list.
- **`0033:2739`'s unscoped index is RETRACTED.**

---

**R13·6 — `BIGSERIAL` cannot safely round-trip through a JavaScript `number` (fixes R12·3/R12·8).**

**Correct, and it is a type error I wrote across two sections of the same append.**
`job_wakeup_outbox.id BIGSERIAL PRIMARY KEY` (`0033:1921`) is a Postgres `int8`, whose range exceeds
JavaScript's exact-integer range (`Number.MAX_SAFE_INTEGER`, 2^53−1). `QueueDelivery` then declares
**`outboxId: number`** (`0033:2774`). Above 2^53 the value silently loses precision — and `node-postgres`
returns `int8` as a **string** by default for exactly this reason, so the declared type does not even
match what the driver hands back.

**Correction — the outbox id is a decimal string end to end.**

- **`outboxId: string`** in `QueueDelivery`.
- **Validated on receipt as a positive base-10 integer string** (`/^[1-9][0-9]*$/`); anything else fails
  loudly, per R12·8's no-silent-fallback rule.
- **Passed back to Postgres without numeric coercion** — never `Number(...)`, never `parseInt`, never
  JSON-number round-tripping.
- **The BullMQ delivery id `wake-{outbox_id}` is unaffected** — it was always a string.
- **`dispatchGeneration` stays `number`**: it is a small `INT`, not `BIGSERIAL`, and is bounded by retry
  counts. Stated explicitly so the fix is not over-applied.

**My addition, not Eli's — the `wake-` prefix is load-bearing for a second reason, and must not be
"simplified" away.** The same BullMQ guard I read for R12·1 has a check immediately above it
(`node_modules/bullmq/dist/cjs/classes/job.js:1045`):

```js
throw new Error('Custom Id cannot be integers');
```

So a delivery id of the bare outbox id — the obvious "simplification" once `outboxId` is a numeric string
— **would throw.** The `wake-` prefix is what keeps the custom id non-integer, and R12·1's colon rule is
what keeps it separator-safe. **Binding rule: the delivery id always carries the `wake-` prefix; it is
not decoration.**

---

**R13·7 — The queue binding is still two alternative schemas (fixes R12·8, and repeats R12·7's defect).**

**Correct, and this one is the round's real lesson.** `0033:2788-2790` reads:

> *"The queue name is derived from the authoritative `jobs.type` row, **or** `target_job_type` is
> structurally tied to it by composite foreign key."*

**That is precisely the failure R12·7 had corrected a few paragraphs earlier in the same append** —
offering an implementer alternatives where a binding schema is required. I fixed the pattern in one place
and immediately reproduced it in another, in one sitting.

**Correction — one schema, no alternative. Eli's recommendation adopted.**

- **`target_job_type` is REMOVED from `job_wakeup_outbox`.** R10·4's column is retired outright; a copied
  queue name is a denormalization the design cannot verify and does not need.
- **The dispatcher loads the authoritative `jobs.type` during its database claim** — the same statement
  that selects the undispatched/lease-expired outbox row joins `jobs` and reads `type`.
- **It enqueues only to that derived queue.** There is no second source of the queue name to disagree
  with it, so there is nothing to bind with a foreign key and nothing to fall out of sync.
- **The composite-FK alternative is RETRACTED**, not left as a documented option.

---

**Test-list reconciliation — the widened round-12 discipline, actually executed this time.**

Round 12 committed to reading new rules against the **entire live test list**, not just the round's own
new tests. Run, with results stated:

- **Round-12 test 3** (canceled **or stale** owner adopted) — **now producible.** R13·1 corrects the
  *rule* to cover both predicates rather than reshaping the test. **Retained, unchanged.**
- **Round-12 test 8** (accepted-then-failed direct attempt records its charge before retry) — **AMENDED,
  not retracted.** Its assertions now carry the `provider_attempt_no` dimension from R13·4.
- **Round-12 test 1** (non-colon wake id accepted by BullMQ) — **retained and strengthened** by round-13
  test 6b, which adds the bare-integer case from `job.js:1045`.
- **Round-12 tests 2, 4, 5, 7, 9, 10** — re-read against every round-13 rule; **none is invalidated.**
  Test 4's `dispatch_generation` semantics are untouched by R13·2, which introduces a *separate* counter
  precisely so test 4 stays true.
- **Rounds 5–11 tests** — the surviving set was already reconciled in round 12 (round-10 test 1 retracted
  in full there). Re-checked against round 13's rules; **no further retractions.**
- **Net: one test amended (r12 test 8), one rule corrected to match its test (r12 test 3), zero tests
  retracted.**

---

**Round-13 tests** (beyond the live set above):

1. **Adoption on a STALE owner:** an operation `accepted`/`in_flight` whose owner is `running` with a
   heartbeat older than 120s is adopted by the reconciler; asserted **separately** from the terminal-owner
   case, since these are the two predicates round 12 conflated.
2. **(a)** Two deliveries of one logical continuation produce the **same** `routing_attempt_key` and
   exactly **one** routing attempt; **(b)** a later genuinely new continuation produces a **different**
   key. Both asserted against `continuation_generation`, with `dispatch_generation` varied independently
   to prove it never enters the key.
3. **Budget-refusal branch commits, not rolls back:** the follower ends `failed`/`BUDGET_EXCEEDED`, the
   attachment is `resolved`, the continuation marker is cleared, **`consumed_at` is set**, and **no
   executable binding points at an unfunded routing attempt** — all asserted after commit.
4. **A charged failure followed by another candidate in the SAME execution attempt** writes **two**
   `origin='direct'` rows distinguished by `provider_attempt_no`; `jobs.cost_cents` equals their sum.
5. Two different provider connections issuing the **same** `provider_charge_id` value both insert
   successfully; the same connection issuing it twice is **rejected**.
6. **(a)** An `outboxId` greater than `Number.MAX_SAFE_INTEGER` survives the full round trip
   (Postgres → payload → Postgres) with **exact** equality and no numeric coercion; **(b)** a bare integer
   delivery id **throws** (`job.js:1045`) while `wake-{id}` is accepted.
7. Single-winner reconciler adoption under concurrency: N reconcilers race, exactly **one** wins the CAS,
   the losers do nothing, and a reconciler whose lease expired and was taken over **cannot renew** itself
   back into ownership.
8. The dispatcher enqueues to the queue named by the authoritative `jobs.type` loaded in its own claim;
   asserted with a deliberately mismatched historical value to prove **no copied queue name exists to
   trust** (`target_job_type` is gone).

---

**Blueprint sequencing — Eli's ruling, recorded and adopted.**

**Deferring the VHE-2 edit was correct, and `0034` must NOT be executed yet.** Do not modify §4.1 or §4.2
while these blockers are open: regenerating now would freeze **incomplete** contracts into both the
Markdown mirror and the binary blueprint, forcing an immediate second amendment. **After round 13 clears
review**, Ashley can authorize **one deliberately scoped `0034`** covering **both** §4.1's
`kind: "execute"` payload **and** §4.2's typed execution result/failure + transactional ledger contract,
with `_BLUEPRINTS-TEXT/_regenerate.py` rerun in that same session. **`0034` remains reserved and
unexecuted.** This does not reverse round 12 — round 12 also deferred it — but it converts my "pending
owner green-light" into an explicit **"not yet, and here is the condition."**

---

**Status after round 13:** `0032` (base) + `0033` (binding + rounds 5–13) remain the removal-lane spec.
**STILL NOT build-authorized.** Next gate remains **another specification review — not the fal probe.**
Administrative direction applied: round 13 appended only; `0032`, `0033`'s body, and rounds 5–12
unmodified; `Progress-update 16` built **only after** this append and the documentation changes are
committed; no `v09`; no blueprint edit; nothing probed, keyed, networked, uploaded, or spent.

**Discipline note for round 14 — the failure mode has changed and the check must change with it.**
Rounds 11 and 12 shipped contradictions *against reality*. Round 13's blockers are mostly **incompleteness
that reads as completeness**: an undefined term, a transaction with one branch, an unscoped constraint, a
type that cannot hold its values, and twice an **"or"** where a decision was required. **New standing
pre-filing check, in addition to the existing ones: grep the round's own new text for an "or" at a
decision point, and for every new identifier, confirm it is defined somewhere in the document — a term
used exactly once is a placeholder, not a specification.** R13·2 was findable by a single grep; R13·7 by
reading one sentence next to the rule that had just outlawed it.

**What I did / did NOT do (round-13 append):** *Did* — verify every cited line by reading it
(`0033:2553-2555` vs `:2864-2865`; `:2666`; `:2678-2680`; `:2739`; `:1921` vs `:2774`; `:2788-2790`);
confirm by grep that **"continuation generation" occurs exactly once in 2,916 lines**; verify R13·4
against the **shipped** `walkChain` loop at `packages/providers/routing.ts:115-136` rather than reasoning
abstractly, and choose option 1 with the reason stated (option 2 would change already-built §7 behavior);
reuse `worker.ts:39-40`'s existing staleness predicate rather than inventing a second definition of
"stale"; find and file the `job.js:1045` bare-integer guard making the `wake-` prefix load-bearing
(**mine, not Eli's**); **actually execute** the widened test-list reconciliation round 12 promised, and
report its result (one test amended, one rule corrected to match its test, zero retracted); record Eli's
blueprint-sequencing ruling and keep `0034` unexecuted. *Did NOT* — edit VHE-2 or any blueprint `.docx`;
execute `0034`; rerun `_regenerate.py`; write or change any code; run the test suite (no source touched —
figures remain **153/153 · preflight 13/4/1**, last measured at `52e3277`); run any live BullMQ/Redis
check (the `job.js` reads are **source reads**, not executions); build `Progress-update 16` (that comes
after this is committed); cut a full backup; run the probe; read the fal key; call any provider; touch the
network; upload anything; spend anything; rewrite `0032`, `0033`'s body, or any prior appendix (round 13
appended only); weaken any R9·3, R10·2, R12·6, or R13·5 constraint.

— `CC-OPUS-01` (Claude Opus 5), 2026-07-27
