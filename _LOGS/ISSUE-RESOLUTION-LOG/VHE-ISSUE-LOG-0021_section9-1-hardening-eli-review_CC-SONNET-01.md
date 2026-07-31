# VHE-ISSUE-LOG-0021  —  §9.1 hardening patch (Eli conditional-pass review)

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0021 |
| **Date / time** | 2026-07-21 ~07:05 EDT |
| **Logged by** | `CC-SONNET-01` (this room runs the Claude Opus 4.8 account model but continues the `CC-SONNET-01` §9.1 line; same owner account per AI-ACCOUNT-REGISTRY.md) |
| **Platform / room** | Claude Code — Desktop, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §9.1 (image inpaint) · §7 (routing) · §5 (masks) · §3 (ingest, flagged) |
| **Category** | Decision + Mistake-correction (hardening of `0020` against an external code review) |
| **Status** | **RESOLVED (patch)** · real-provider validation OPEN (separate follow-on) |

---

## 1. What happened

The owner relayed an external review of the §9.1 image-inpaint core (`0020`) by "Eli" (verdict:
**conditional pass**). Eli reviewed the ZIP review-package only (no full repo/lockfile), raised 5
code findings + logging cleanups, and issued rulings on the open decisions. The owner said to use
best judgment ("no yes-man energy").

I re-verified every Eli claim against the **actual source** and the **authoritative §9.1 blueprint
text** (VHE-2 `word/document.xml` mirror lines 366–371) before acting. Findings held up:

1. **Feather clipped by the crop.** `maskBoundingBoxPx` computed the crop from vector shapes +
   `marginFrac` only — it never read `featherPx`. `rasterizeMask` (§5) blurs by sigma≈featherPx/2
   (reach ≈1.5·featherPx). A tight mask + real feather → the crop guillotines the feather → visible
   seam, defeating the blueprint's "Seamless edges." Every `0020` test used `featherPx: 0`, so it was
   never exercised.
2. **Provider max-dims not clamped — literal blueprint miss.** §9.1 says verbatim: *"crop … to the
   mask's bounding box 25% margin (clamped to provider maxWidth/Height)."* `0020` instead clamped the
   bbox to the **image frame** and treated oversized-crop-vs-provider-max as "route around it"
   (`routing.manifestSatisfies` filters the provider out → `NO_PROVIDER`). A 4K/8K crop that could be
   downscale-submit-upscaled was rejected outright. This was a different clamp than the one the
   blueprint names.
3. **2–4 candidate promise unenforced.** `runImageInpaint` looped over `result.assetKeys` including
   **zero** and returned `success`. A real adapter may ignore `extra.candidateCount`.
4. **Metadata/ICC/EXIF silently dropped** by sharp in the composite (color shift, lost DPI,
   orientation).
5. **"User outranks template" was ordering, not conflict resolution.** "keep the watermark" + default
   negative "watermark" still shipped a contradiction.
   Plus: no runtime validation of blank instruction / bad dims / bad margin / malformed result.

Logging drift Eli flagged (all confirmed): `LOG-INDEX` still listed "provision hosted dev services …
Blocks Phase 0" although `0011`/`CURRENT-STATUS` say the 3 services connect; handoff `-10` said 25%
per side "can roughly double" (it is **1.5×**, not 2×); "built and tested live" was too loose (the
provider path is mock-only).

## 2. Why it matters

§9.2 video repair is designed to **reuse** §9.1's `compositeUnderMask` + crop helpers across hundreds
of frames. Eli's point stands: shipping a flawed crop/composite into §9.2 turns a per-still bug into a
per-frame one. Feather clipping and the missing provider clamp are the two that would actually degrade
output (seams; needless `NO_PROVIDER` on large photos).

## 3. Attempted solutions

Straight implementation after verification — no dead ends. One test-authoring miss:

1. **Attempt:** feather-containment test used a 4px mask + `featherPx: 40` and asserted the cropped
   mask center `> 200`.
   **Result:** FAIL — a 4px bright region blurred by sigma 20 spreads its energy so thin the center
   is ~2 (blur conserves total intensity). The *containment* asserts (borders ~0) passed; the
   "center bright" assert was invalid for that degenerate tiny-mask/huge-feather combo. Fixed by
   using a realistic 40px mask + `featherPx: 20` so the center stays clearly bright and the feather
   pad is still exercised. Re-ran: green.

## 4. Resolution

All edits in `packages/repair/inpaint.ts` (+ tests). Verbatim product strings preserved:
`INPAINT_NEGATIVE_DEFAULT` is now derived by `INPAINT_NEGATIVE_TERMS.join(', ')`, byte-identical.

1. **Feather-aware crop.** `maskBoundingBoxPx(m, W, H, marginFrac=0.25, featherPx=0)` pads each side
   by `ceil(featherPx*1.5)+1` **when featherPx>0** (guarded so the default 0 leaves pure-geometry
   results byte-for-byte unchanged — existing `0020` bbox tests still pass untouched).
   `runImageInpaint` passes `params.mask.featherPx`.
2. **Provider scale-to-fit** (replaces "route around"): new pure `fitBoxToProviderLimit(box, limit)`
   (proportional downscale, never upscales) + `resolveInpaintProviderLimit(connections)`.
   `runImageInpaint` accepts optional `params.providerLimit`; when the crop exceeds it, the
   **submitted** crop+mask are downscaled and the request width/height reduced, while compositing
   still runs at **full crop resolution** (the returned patch upscales back inside
   `compositeUnderMask`). **DESIGN DECISION (flagged for owner/Eli):** the limit is the **largest**
   maxWidth/maxHeight among the owner's `image.inpaint`+mask connections (make the crop routable to
   the highest-capacity eligible provider). Reads manifests only via `loadConnections` (key-free) —
   no secret touched. Alternative (clamp to head-of-chain) noted, not chosen. Left in a named,
   reviewable helper rather than coupling resize logic into §7's generic chain walk.
3. **Candidate validation.** Empty `result.assetKeys` → `throw new ApiError('PROVIDER_REJECTED', 422,
   'provider returned zero inpaint candidates')`. Composites however many (≥1) came back; outcome now
   carries `requestedCandidateCount` alongside the honest `candidates.length`.
4. **Input validation** (precondition guards → plain `Error`, because the §4.3 taxonomy is a **closed
   set with no BAD_REQUEST** and inventing a code is a forbidden blueprint change): non-empty
   `userInstruction`, positive-integer `assetWidth/Height`, finite `marginFrac >= 0`. Also guards
   `result.assetKeys` is an array.
5. **Bounded prompt-conflict subtraction.** New `conflictingNegativeTerms(userInstruction)`: when the
   instruction matches a preserve/add intent word AND a concept keyword for a default term, that one
   default term is dropped from the negative prompt (user negatives always kept, always first). This
   is a small keyword heuristic, **not** a prompt-policy engine (per Eli's "do not build a separate
   prompt-policy system this phase"). **Known limits (accepted):** keys on intent-word + concept
   co-occurrence, so a negated request ("don't add extra fingers") can mis-fire; hand/finger keywords
   are deliberately narrow ("stylized hand", "extra finger") so ordinary "fix the hand" keeps its
   protective negatives. Target = the safe common cases (keep the watermark / add text / deliberate
   blur).
6. **Metadata preserved.** `compositeUnderMask` final pipeline gains `.keepMetadata()` (sharp 0.35.3)
   so ICC/EXIF/density survive. **Orientation is NOT re-oriented here** — §9.1 assumes ingest (§3)
   delivered an orientation-normalized asset (stored pixels match assetWidth×Height). **Flagged as a
   §3 owner-policy item** (normalize EXIF orientation at ingest) rather than bodging rotation into the
   still pipeline.

**Logging fixes:** `LOG-INDEX` service-provisioning open-item struck through as DONE; the "roughly
double" error is corrected here (**25% per side ⇒ 1.5× each dimension**, since +25%+25% = +50%);
`CURRENT-STATUS` reworded to "deterministic pipeline + live DB/queue verified; provider path is
mock-only." Handoff `-10` is append-only historical and was **not** edited in place (rule); this entry
is its correction of record.

**Owner+Eli rulings recorded (resolving `0017`/`0018`/`0020` open items + handoff `-10` Q3–Q6):**
§4 both retry corrections APPROVED (`0017`); §11 "Apply" defer APPROVED; cost-defaults stay a code
data module for now (DB `config` table only when an admin/config system exists); web-first +
single-user-first, keep `owner_id`, defer Tauri/teams/marketplace (§17 Q4/Q5/Q6); 25%-per-side margin
reading APPROVED (with feather pad added separately, done above); oversized-crop "route around"
**NOT** approved → scale-to-fit built (done above).

## 5. Verification

Full suite via the pinned node (fnm not reliably on PATH):
`%APPDATA%\fnm\node-versions\v22.23.1\installation\node.exe node_modules/vitest/vitest.mjs run`
→ **Test Files 7 passed (7) · Tests 55 passed (55)** (was 42/42; +13 new §9.1 tests, 0 regressions).

New tests: feather containment (borders ~0, center bright, box grown ≥50px beyond no-feather);
`fitBoxToProviderLimit` (8000×6000→≤2048 proportional; within-limit unchanged, never upscales);
`resolveInpaintProviderLimit` (largest mask-capable max; undefined when none);
prompt-conflict (keep-watermark drops only 'watermark'; add-text drops 'text artifacts'; ordinary
'fix the hand' keeps full default; user-negative stays first ahead of reduced defaults);
runImageInpaint hardening (downscale-submit but full-frame composite verified via output metadata +
pixels; zero-candidate rejects; requestedCandidateCount reported; invalid inputs reject **before**
touching storage/provider — asserted with throwing deps).

**NOT verified:** any real provider call. The provider path is still exercised by mock adapters only.

## 6. Affected files / components / tests / commits

- `packages/repair/inpaint.ts` — feather-aware bbox; `fitBoxToProviderLimit` +
  `resolveInpaintProviderLimit` + `ProviderLimit`; `providerLimit` param + scale-to-fit in
  `runImageInpaint`; candidate validation + `requestedCandidateCount`; input guards; bounded
  `conflictingNegativeTerms` + wired into `compileInpaintPrompt`; `INPAINT_NEGATIVE_TERMS`;
  `.keepMetadata()` in `compositeUnderMask`; header DEFERRED note updated.
- `packages/repair/inpaint.test.ts` — +13 tests (5 new describe blocks). 55/55.
- `_LOGS/LOG-INDEX.md` — 0021 row; stale hosted-services open-item corrected.
- Commit: recorded in a logs-only follow-up after this entry is committed (same pattern as `0016`/`0019`).

## 7. Prevention

- Any pixel pipeline that feathers a mask must size its crop from the **rasterized** mask extent, not
  the vector extent. (Harvest: a "feather ⊂ crop" invariant helper for the Soren Tools Library.)
- When a blueprint line contains a parenthetical constraint ("(clamped to provider maxWidth/Height)"),
  treat it as a **requirement to implement**, not a note to route around. `0020` substituted a
  different clamp; verifying against `word/document.xml` (not the lossy mirror) caught it.
- Provider adapters must have a candidate-count contract; the orchestrator must never infer success
  from a queue/response shape (echoes `0017`'s "assert terminal state, don't infer from the queue").

## 8. Related entries

- `VHE-ISSUE-LOG-0020` — the §9.1 core this patch hardens.
- `VHE-ISSUE-LOG-0018` / `0019` — §7 routing + the `manifestSatisfies` size filter this patch now
  downscales *into* instead of being rejected by.
- `VHE-ISSUE-LOG-0017` — §4 retry rulings, approved here by owner+Eli.
- `VHE-ISSUE-LOG-0009` / `0011` — the 4 AI fixtures; real-provider validation stays OPEN until real
  `bad_hand.png` + `garbled_text.png` run against a live provider (temp fixtures may prove plumbing
  but must NOT flip the preflight FAIL 4).

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

_(none)_
