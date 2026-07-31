# VHE-ISSUE-LOG-0023  —  Assessment of the Higgsfield teardown source addon

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0023 |
| **Date / time** | 2026-07-21 ~midday EDT |
| **Logged by** | `CC-SONNET-01` (Claude Opus 4.8 account model, CC-SONNET-01 line) |
| **Platform / room** | Claude Code — Desktop, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-1 (vision) · VHE-2 §7 (routing) · §10 (burst) · §9.3 (identity) · §4 (jobs) |
| **Category** | Discovery / Decision (source-library assessment; no build) |
| **Status** | **REFERENCE — deferred to the generation-layer phase.** No code changed. |

---

## 1. What happened

Owner added `VHE-ADDON-SOURCE-1_Higgsfield_Clone_Teardown_7-21-2026.docx` (a Marcus-authored source
teardown of a build-in-public "cloned Higgsfield in 2h" video) and asked whether it is "too late to
incorporate." I read it in full (extracted from the .docx).

## 2. Assessment — is it too late?

**No, and it requires no change to anything built.** Rationale:
- It is a **source-library reference**, not a blueprint revision. It is explicitly filed by Marcus as a
  companion to VHE-1..4, and it repeatedly maps its patterns onto EXISTING VHE sections ("this is
  literally how we already work"). It does not modify any frozen blueprint (VHE-1..4 stay intact).
- Its subject is the **generation layer** — video.t2v / i2v / extend (§7 capabilities), chained
  generation (§10 burst mode), identity ops (§9.3). All of that is **downstream and unbuilt**; the
  current build is the repair core (§2–§7 routing, §9.1 image inpaint, hardened + validated in
  `0021`/`0022`). Nothing built so far conflicts with or is invalidated by it.
- Most items **validate decisions already made** (live capability discovery = §7 CapabilityManifest;
  async job/poll = §4; first/last-frame conditioning = §10 spine; "never re-render untouched" = §0/§6.4;
  per-capability pricing = §7; consent-gating = VHE-4 §A8). Confirmation, not new scope.

## 3. The one genuinely new, actionable item

**OpenRouter shipped a unified video-generation API (as of April 2026):** one OpenAI-compatible
endpoint fronting Veo/Kling/Wan/Sora/Seedance/Hailuo, an async submit→jobId→poll→download model that
mirrors §4, normalized params, AND a **live capability-manifest endpoint `/api/v1/videos/models`**
(per-model resolutions/durations/aspect/pricing/passthrough).

Design consequence for us: our §7 router could **hydrate its CapabilityManifest live** from that
endpoint (on connect + TTL) instead of hand-maintaining it — the same discipline VHE-4 §A4 already
mandates for voice catalogs. Directly relevant because the first real §7 adapters (`0022`,
OpenAI/Gemini) use **hardcoded** manifests. OpenRouter would become one BYOK video connection among
many (no house-model lock-in, consistent with VHE-1).

## 4. Resolution (what I did / did NOT do)

- **Did:** read + assessed the source; logged this entry; will include the .docx + this assessment in
  the Eli context package so the review panel has it.
- **Did NOT:** change any code, blueprint, or architecture. Building generation features (or a live-
  manifest hydration path) off a source doc is unauthorized scope growth, and the repair core is the
  active priority. The source's own §6 open questions are **owner decisions**, deferred:
  1. OpenRouter first vs. direct-to-provider for video gen.
  2. Live-hydrate the capability manifest from `/videos/models` on connect+TTL, or snapshot it?
     (VHE-4 already chose "live, 24h TTL" for voice — likely the same call.)
  3. Face/identity: self-host swap (FaceFusion) for cost vs. hosted for launch simplicity (ties to the
     still-open GPU decision, §17).
  4. Where generated media sits relative to the "two build versions" (owner/Marcus concept — I lack
     context; not mine to resolve).

## 5. Verification

N/A — assessment only, no code run. The source's headline factual claim (OpenRouter unified video
API, live models endpoint) is stated as verified in the teardown; I did not independently re-verify it
against OpenRouter's live docs this session (flag for whoever builds the video-gen connection).

## 6. Affected files / components

- `VHE-ADDON-SOURCE-1_Higgsfield_Clone_Teardown_7-21-2026.docx` — new source doc in project root
  (untracked; owner-added). No repo code touched.

## 7. Prevention / follow-up

- When the generation layer is scheduled: settle §6's four open questions first; evaluate OpenRouter's
  `/videos/models` as the live manifest source for §7; verify the OpenRouter video API against its
  current docs before integrating (it's a fast-moving surface).
- Consider whether CLAUDE.md's source-of-truth list should name `VHE-ADDON-SOURCE-*` docs — an owner
  call (I did not edit CLAUDE.md).

## 8. Related entries

- `VHE-ISSUE-LOG-0022` — the first real §7 adapters, whose hardcoded manifests are exactly what
  OpenRouter's live `/videos/models` endpoint would replace for video.
- `VHE-ISSUE-LOG-0018`/`0019` — §7 routing + fallback order this would extend to video capabilities.

---

## Appended corrections

> Never edit the sections above after the entry is filed. Corrections go here, newest last, each one
> signed and dated.

### 2026-07-21 evening EDT — `CC-HAIKU-01` — Eli Q3/Q4 rulings (owner-authorized)

- **Q3 (manifest sourcing) → RULED: add a HYBRID manifest cache seam now.** Refresh on connect +
  after 24h, retain last-known-good, allow manual snapshots for providers without discovery
  endpoints. Do NOT pause §9.2 to retrofit every existing (hardcoded-manifest) image adapter.
  OpenRouter's live `/api/v1/videos/models` endpoint hydrates the video manifest through this seam
  when the generation layer begins. Built as `packages/providers/manifest-cache.ts` (seam only, not
  wired into the current adapters). See `VHE-ISSUE-LOG-0024`.
- **Q4 (generation layer / Higgsfield source) → RULED: keep DEFERRED, as assessed here.** Current
  direction confirmed: **OpenRouter-first** for video generation, **direct-provider adapters later**
  where justified, and **hosted consent-gated identity processing before** considering self-hosted
  face-swap (FaceFusion). No code toward the gen layer this session. The `VHE-ADDON-SOURCE-1_*.docx`
  git-tracking / CLAUDE.md-listing question remains an owner call (still untracked).
