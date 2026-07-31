# VHE-ISSUE-LOG-0020  —  §9.1 image inpaint core built

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0020 |
| **Date / time** | 2026-07-20 ~12:15 EDT |
| **Logged by** | `CC-SONNET-01` (Claude Sonnet 5) |
| **Platform / room** | Claude Code — Desktop, Windows 11, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §9.1 (Image inpaint) · §5 (mask rasterize) · §7 (runGeneration) · §9.2 (composite rule) |
| **Category** | Build record / Decision |
| **Status** | **RESOLVED** — §9.1 core built and verified live; two items DEFERRED/FLAGGED (see §4) |

---

## 1. What happened

Owner selected §9.1 image inpaint as the next build (over first wiring a provider key), then left
and delegated all decisions to the builder ("make the best call and log everything"). §9.1 was built
as `packages/repair/inpaint.ts` + `packages/repair/inpaint.test.ts`.

**§9.1 is PROSE in VHE-2** — unlike §5/§7/§9.4/§9.5 it has **no verbatim code block**, and (confirmed
by extracting `word/document.xml` directly) **no stated exit gate**. So this is an implementation of
the described pipeline, not a transcription. The VHE-2 §0 "verbatim code" rule therefore does not
apply to §9.1 (there is no code to copy); the two literal *product strings* it does contain were
copied verbatim from the .docx (see §5 below). The pipeline, in the blueprint's own order:

1. Rasterize the mask at asset resolution, feathered → reuse §5 `rasterizeMask`.
2. Crop-inpaint-paste: crop source+mask to the mask bounding box + 25% margin (clamped to provider
   maxWidth/Height); inpaint the crop; paste back under the feathered mask.
3. Compile the prompt `"{user_instruction}. {auto_context}. Match the surrounding lighting, color
   grade, grain and perspective exactly. Seamless edges."` + the negative default; **user text always
   outranks the template on conflict**.
4. Route `image.inpaint` (§7), request 2–4 candidates, composite each behind the mask, present
   before/after. **Apply = append a §11 edit-graph node; pixels never destroyed.**

## 2. Why it matters

§9.1 is the first repair pipeline and the template the others follow: §9.2 (video) reuses its
composite rule and prompt template; §9.4 auto-detect feeds it `auto_context` + a pre-filled range.
Getting the seams right (injected storage, injected §7 routing, the composite math) is what lets
§9.2/§9.4 build on top without rework. It also proves `runGeneration` (§7) is usable by a real repair
caller exactly as §7 intended.

## 3. Attempted solutions

Straight build, no dead ends. The design questions were resolved by flagging + a behavior-preserving
choice rather than a silent pick (anti-drift), listed in §4. One test bug surfaced and was fixed:

1. **Attempt:** first full run of `inpaint.test.ts`. **Result:** 9/10 pass; the stroke-radius test
   failed because a leftover `MaskObject.parse` used a single stroke point, violating §5's `min(2)`
   `NormPoint` constraint (a stray declaration I had already superseded with a valid two-point
   version). Removed the dead parse → 10/10. Module logic was never at fault.

## 4. Resolution

Built `packages/repair/inpaint.ts` with independently-testable pure helpers plus one orchestrator:

- `maskBoundingBoxPx(mask, W, H, marginFrac=0.25)` — union px bbox of all shapes (rect corners,
  polygon points, **stroke points ± radius·W** since §5 radius is normalized to width), grown per
  side, clamped to the frame, integerized (`w`/`h` ≥ 1). `points` masks throw (must be SAM-resolved
  first — same rule as `rasterizeMask`).
- `compileInpaintPrompt({userInstruction, autoContext?, userNegative?})` — user instruction leads;
  optional auto-context clause; verbatim template suffix; negative = user negatives first, then the
  verbatim default.
- `clampCandidateCount(n)` — the §9.1 "2–4 candidates" band, default 3.
- `cropToBox`, `compositeUnderMask` — the §9.2 rule on a still: `out = orig·(1−mask) + patch·mask`,
  realized by making the feathered greyscale mask crop the patch's alpha channel (`joinChannel`) and
  compositing "over" at the box offset (Porter-Duff "over" is exactly that blend).
- `runImageInpaint(params, deps)` — load source → rasterize mask (§5) → crop source+mask → store
  crops → compile prompt → build a `GenRequest{capability:'image.inpaint', width/height=box, sourceImageKey,
  maskKey, extra.candidateCount}` → `deps.runGeneration` (§7) → composite **each** returned candidate
  behind the mask → return `{ beforeKey, candidates[], providerId, providerSlug, costCents, request, box }`.

**Decisions made deliberately (none silent):**

1. **`auto_context` is an OPTIONAL caller-supplied input**, not an invented auto-context generator.
   §9.4 will hand over a hint (e.g. "possible hand anomaly, frames 141–167"); a plain user repair
   supplies none and the clause is omitted. Inventing a context-describer would be scope growth.
2. **"User text outranks the template on conflict" → mechanical precedence ordering:** user
   instruction leads the positive prompt, user negatives lead the negative prompt, template defaults
   follow. (True semantic conflict resolution is the model's job; ordering is the honest mechanical
   realization.)
3. **Storage is an injected dependency** (`loadImage`/`storeImage`). **No S3 read/write helper is
   built here** — that belongs to a storage package, outside §9.1's scope, and mirrors how §7 injected
   `query`. Keeps the image core deterministic and testable (in-memory map in tests).
4. **"25% margin" interpreted as a per-side grow of 25% of the box's own dimension** (`marginFrac`
   param, default 0.25). Tunable; flagged as an interpretation (the phrase could also mean 12.5%/side).

**DEFERRED / FLAGGED (not silently invented):**

- **§11 "Apply = append an edit-graph node; pixels never destroyed":** §11 (edit graph) is **not
  built**. `runImageInpaint` returns the before/after candidates and is fully non-destructive (source
  is only read); wiring the apply node is a **§11-time follow-up**. Not stubbed with an invented
  edit-graph schema.
- **Provider maxWidth/maxHeight clamp of an OVERSIZED crop (downscale-before-submit):** the bbox is
  clamped to the image frame (unambiguous). Shrinking a crop that *still* exceeds a provider's max
  dims — the "(clamped to provider maxWidth/Height)" clause — is an **open edge left as a logged
  decision**, not silently chosen. Routing (§7 `manifestSatisfies`) already filters providers whose
  max dims can't hold the request, so today an oversized crop simply routes to a provider that can (or
  `NO_PROVIDER`); the downscale-then-upscale optimization is a future enhancement.

## 5. Verification

Ran under fnm-pinned Node **22.23.1** (fnm is not on this shell's PATH this session; invoked the
pinned binary directly at `%APPDATA%\fnm\node-versions\v22.23.1\installation\node.exe` — recorded for
the next builder):

- `node node_modules/vitest/vitest.mjs run packages/repair/inpaint.test.ts --reporter=verbose`
  → **10/10 pass.** Covers: bbox union+margin+clamp+stroke-radius; prompt compile (verbatim template,
  user-first precedence, optional auto-context); candidate clamp; **composite pixels** (green inside
  mask, original red outside, and original preserved for in-box-but-out-of-mask pixels); and
  **`runImageInpaint` end-to-end** with injected in-memory storage + a mock provider returning 2 green
  crop-sized patches — asserts it routes `image.inpaint` with the compiled prompt, returns 2
  composited full-frames (repaired inside the mask, untouched outside), `beforeKey` = the untouched
  source, and the mock's `costCents`/`connectionId`.
- Full suite `node node_modules/vitest/vitest.mjs run` → **Test Files 7 passed, Tests 42 passed**
  (was 32; +10 §9.1), 13.25 s — the live-Postgres §7/§4/queue tests ran (not self-skipped), so no
  regression against live services.

## 6. Affected files / components / tests / commits

- `packages/repair/inpaint.ts` — created (§9.1 pipeline + pure helpers).
- `packages/repair/inpaint.test.ts` — created (10 deterministic tests, sharp + mock provider).
- `_LOGS/LOG-INDEX.md` — 0020 claimed.
- `_LOGS/AI-ACCOUNT-REGISTRY.md` — `CC-SONNET-01` self-registered (Sonnet 5, new model on the
  existing account ⇒ new identifier per the standing convention).
- No change to any §2 schema, any §5/§7 code, or any verbatim block.
- **Commit:** NOT committed this session. The owner asked to build + log, not to commit; the harness
  rule is "commit only when asked." Work is on disk, green, and fully logged. See the handoff.

## 7. Prevention

- **When a VHE-2 section is prose (no code block), say so explicitly and record that the §0 verbatim
  rule is N/A** — future builders should not hunt for a nonexistent code block or assume drift. Verify
  the presence/absence of an "Exit gate:" line by extracting `word/document.xml`, not the lossy mirror.
- **The injected-storage seam (`loadImage`/`storeImage`) is the pattern for every media job** — it
  keeps image/video pipelines deterministically testable without live S3, exactly as the injected
  `query` did for DB-touching code. Reuse it for §9.2/§9.4.
- Harvest candidate: a tiny `packages/repair/` composite/crop helper set is reusable by §9.2 and §9.5.

## 8. Related entries

- `VHE-ISSUE-LOG-0019` — §7 `runGeneration`, which this consumes exactly as §7 intended.
- `VHE-ISSUE-LOG-0018` — the routing ruling (`image.inpaint` visual order) this relies on.
- `VHE-ISSUE-LOG-0016` — §5 mask format (`rasterizeMask`, feathering) this builds on.
- `VHE-ISSUE-LOG-0007` — production worker topology (where these jobs run) still open; unaffected here.

---

## Appended corrections

**2026-07-20 ~12:35 EDT — `CC-SONNET-01` — committed.** The owner returned and explicitly asked to
commit. §9.1 was committed to `master` as **`1f2ec39`** ("Section 9.1 image inpaint core: crop-inpaint-
paste + mask compositing over §7 routing"), on top of `f687de5`. 7 files, +810/−57
(`packages/repair/{inpaint,inpaint.test}.ts` + the `_LOGS/*` for this entry). The untracked
`VHE-progaress sofar_2026-07-20.zip` was deliberately excluded (binary progress archive, not this
session's work). Staged diff was secret-scanned before commit (clean). Nothing in the sections above
changed; this only records the commit that §6/§4 stated was not yet done.
