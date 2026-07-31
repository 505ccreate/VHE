# Open questions for Eli — ✅ ANSWERED 2026-07-21 evening (owner relayed Eli's rulings)

> **RESOLVED.** All four questions were answered and acted on this session (`CC-HAIKU-01`):
> - **Q1 → build §9.2A deterministic core now** (done; repair-quality still gated on real §1 fixtures).
> - **Q2 → versioned `ProviderExecutionContext` (Q2a/b) + versioned pricing catalog (Q2c)** — recorded
>   as an appended correction on `VHE-ISSUE-LOG-0022`; built.
> - **Q3 → hybrid manifest cache seam** — appended to `VHE-ISSUE-LOG-0023`; built (seam only).
> - **Q4 → gen layer stays deferred; OpenRouter-first video, direct adapters later, hosted
>   consent-gated identity before self-hosted face-swap** — appended to `VHE-ISSUE-LOG-0023`.
>
> Full build + verification in **`VHE-ISSUE-LOG-0024`**. This file is kept for the record; the
> `.docx` git-tracking sub-question of Q4 is still an owner call. The carried owner-side items at the
> bottom (real §1 fixtures, fal/Replicate keys, Gemini paid key, `0007`) remain open.

---

**These are the questions the owner put to Eli after the**
§9.1 hardening (`VHE-ISSUE-LOG-0021`) + the first real paid provider run (`VHE-ISSUE-LOG-0022`) + the
Higgsfield source assessment (`VHE-ISSUE-LOG-0023`). When Eli responds, the owner will bring his
answers into the new room. Your job then: record each ruling in the cited log(s) and act only on
what's authorized (no scope growth).

> These are NEW decisions since Eli's §9.1 review. Do NOT re-ask what he already ruled (§4 retries,
> defer §11, cost-defaults in code, web/single-user-first, 25%/side + feather, scale-to-fit).

---

## Q1 — §9.2 timing
Eli's gate was "after the real fixtures pass, authorize §9.2." The real AI fixtures still aren't
delivered, so only **synthetic plumbing** validation ran (OpenAI gpt-image-1 passed end-to-end;
repair **quality** unproven). **Authorize building §9.2's deterministic core now** (frame extraction,
keyframe math, per-frame compositing reusing §9.1's `compositeUnderMask` — no key/GPU needed), or hold
all of §9.2 until real fixtures validate §9.1 quality?
→ Record the ruling in a new handoff + `CURRENT-STATUS`; if "build," proceed with the §9.2 deterministic
core only (SAM/ProPainter/RIFE stay GPU-blocked).

## Q2 — three architecture findings from `VHE-ISSUE-LOG-0022` (§6 of that entry)
a. **`ProviderAdapter` has no storage seam** — a real adapter can't resolve `sourceImageKey`/`maskKey`
   to bytes or persist outputs. Change the frozen §7 interface (presigned URLs in the request, or a
   storage dep on `submit`), or keep the factory-closure workaround?
b. **Where do provider output images get persisted** (adapter downloads → storage) — the adapter's
   job, or the worker wrapping `runGeneration`?
c. Providers return **no per-call cost**, only token usage. Accept usage-based estimates + dashboard
   reconciliation, or build a per-model pricing table?
→ Record in `0022` as an appended, signed correction (don't edit its filed sections). Any interface
change to §7 needs an explicit owner OK first (frozen §2/§7 surface).

## Q3 — manifest sourcing (ties to `VHE-ISSUE-LOG-0023`)
The real `0022` adapters use **hardcoded** capability manifests. The Higgsfield teardown flags
OpenRouter's live `/api/v1/videos/models` endpoint. Move §7 to **live-hydrated** manifests (like
VHE-4's "live, 24h TTL" voice catalog), or keep hardcoded until the generation layer?
→ Record in `0023` (appended) and/or `0022`. Likely a gen-layer-phase decision.

## Q4 — generation layer / Higgsfield source (`VHE-ISSUE-LOG-0023`)
Agree the teardown is a **gen-layer-phase input (deferred)**, not to act on now? Any early read on its
§6 questions — OpenRouter-first vs direct-to-provider for video gen; self-hosted (FaceFusion) vs hosted
face-swap? Also: should the `VHE-ADDON-SOURCE-1_*.docx` be git-tracked and named in CLAUDE.md's
source list? (Owner call; the `.docx` is currently untracked in the repo root.)

---

## Also still open (owner-side, not Eli) — carried
- The **4 frozen §1 AI fixtures** (`bad_hand.png`, `garbled_text.png`, 2 mp4s) — the only way to test
  repair QUALITY; still the preflight FAIL 4 (`0009`/`0011`).
- **fal.ai/Replicate** — no key in the library (reference-only); key + model picks needed if wanted.
- **Gemini paid key** — the free key is quota-limited for image gen; a paid ("AQ."-format) key could
  validate Gemini (`0022`).
- **`VHE-ISSUE-LOG-0007`** — production worker topology; deferred to deployment.
