# VHE-ISSUE-LOG-0003  —  Six blocking decisions unanswered; Phase 0 cannot exit

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0003 |
| **Date / time** | 2026-07-19 12:40 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §17, VHE-1 "Open Decisions Before Building Starts", VHE-3 "Decision That Changes This List", VHE-4 §A12 |
| **Category** | Decision / Blocker |
| **Status** | **PARTIALLY RESOLVED** — Q1 and Q3 answered by owner 2026-07-19 (see Appended corrections); Q2, Q4, Q5, Q6 still open |

---

## 1. What happened

Three separate blueprint documents independently flag the same set of open decisions as gating
conditions, and none of them appear to have been answered yet. VHE-2 §17 is titled, unambiguously,
**"Answer Before Phase 0 Ends."**

The six questions, consolidated (VHE-2 §17 and VHE-1's list are the same six):

1. **Confirm the existing platform stack** — framework, DB, storage, hosting. VHE-2 *assumes*
   Node / Postgres / S3. VHE-1 states plainly that "everything downstream assumes an answer here."
2. **Which AI generation providers do users already connect?** Those adapters get built first (VHE-2 §7).
3. **Local GPU node (24 GB class) or API-only launch with hosted fallbacks?**
4. **Web-only at launch, or is a desktop wrapper (Tauri) required?**
5. **Team size and skill mix.** Phase timings in VHE-2 §16 assume ~2 full-stack + 1 ML-leaning engineer.
6. **Paid plugin marketplace at launch, or free-install only?**

VHE-3 separately calls out **#3 as the decision that changes the pre-flight download list itself** —
whether the CUDA `torch` build and five sets of local model weights (SAM 2, ProPainter, RIFE,
Real-ESRGAN, CodeFormer, insightface) are needed on day one, or whether the build starts with
fal.ai / Replicate adapters and adds hardware later.

VHE-4 §A12 adds its own open questions for the audio layer, to be answered before Phase A-1.

## 2. Why it matters

**Question 3 is the expensive one and it is blocking immediately.** It determines whether pre-flight
means downloading tens of gigabytes of model weights and a driver-matched CUDA build, or installing
two lightweight HTTP adapters. Guessing wrong costs real money and days of setup time in the wrong
direction.

**Question 1 is the architecturally dangerous one.** VHE-2's entire schema (§2), job lifecycle (§4),
and storage-key design assume Postgres + S3-compatible storage. If the existing platform runs on
something else, that assumption propagates into every work order before anyone notices, and unwinding
it later means rewriting the foundation.

More generally: these are exactly the questions a builder under pressure will quietly answer for
itself in order to keep moving. That is the drift this logging system exists to prevent. An AI
builder picking "reasonable defaults" for stack and provider choice is how two rooms end up building
against two different architectures.

## 3. Attempted solutions

1. **Attempt:** Searched all five blueprint documents for answers, resolutions, or decision records
   for any of the six questions.
   **Result:** None found. The questions appear only as open items. VHE-5 (dated 7-19-2026, the most
   recent document) does not record answers either.
2. **Attempt:** Checked the project directory for any decision log, ADR, notes file, or README that
   might carry answers outside the blueprints.
   **Result:** None exists. The directory contains only the five `.docx` files and two `.png` images.
   See `VHE-ISSUE-LOG-0001`.
3. **Considered:** Inferring answers from context — e.g. that the machine is Windows 11 with no
   confirmed CUDA GPU, suggesting API-only.
   **Not done deliberately.** This is precisely the assumption-making the project rules forbid. The
   development machine's hardware says nothing about the production deployment target. Logged as an
   open question rather than an inferred answer.

## 4. Resolution

**Unresolved. Requires the project owner.** No builder should proceed past Phase 0 pre-flight without
at minimum questions **1 and 3** answered, because those two change what gets installed and what the
foundation is built on.

Questions 4, 5, and 6 are lower urgency — they affect later phases and can be answered before
Phase 4/5 without blocking foundation work. Question 2 is needed before VHE-2 §7 adapter work begins.

**Recommended next action:** the owner answers questions 1 and 3 in writing, and the answers get
recorded as an appended correction to this entry — so the decision has one permanent, citable home
rather than living in a chat log that the next platform cannot see.

## 5. Verification

Verified by full-text search across all five extracted blueprint documents and a directory scan for
any external decision record. **No answers exist in the project as of 2026-07-19 12:40 EDT.**

The status of this entry is by definition unverified-because-unresolved. It must not be closed until
answers are recorded here.

## 6. Affected files / components / tests / commits

- Blocks: VHE-2 §1 (Pre-Flight) completion, VHE-2 §2 (Schema), VHE-2 §7 (Provider Adapters)
- Blocks: VHE-3 pre-flight download list — cannot be finalized until Q3 is answered
- Downstream: VHE-2 §16 Phase 0 exit gate
- No files affected — no code exists

## 7. Prevention

Answered decisions should be recorded as appended corrections to this entry, not scattered across
chat sessions on different platforms. A decision that lives only in a conversation is invisible to the
next room and will be re-litigated or re-assumed.

Going forward: any question a builder cannot answer from the blueprints gets logged as a numbered
entry with status UNRESOLVED rather than answered by inference. That rule is now written into
`SESSION-PROTOCOL.md` §4.

## 8. Related entries

- `VHE-ISSUE-LOG-0001` — project state audit; confirms no decision record exists anywhere
- `VHE-ISSUE-LOG-0002` — VHE-5 version ambiguity, a related source-of-truth problem

---

## Appended corrections

> Owner answers go here. Format:
> `2026-MM-DD — Q3 answered: [answer]. Recorded by [identifier] on behalf of the project owner.`

**2026-07-19 — Q1 answered: the VHE-2 assumed stack is CONFIRMED.** Node 22 + Fastify, Postgres 16,
Redis 7 + BullMQ, S3-compatible storage, Next.js/React — greenfield, no existing platform to
reconcile. Qualifier added by the owner in the same message: **build/develop locally, host on
free tiers (Vercel / Firebase / Supabase)** — the architectural implications of that qualifier are
analyzed in `VHE-ISSUE-LOG-0007` and the production worker topology remains an open sub-decision.
Recorded by `CC-OPUS-01` on behalf of the project owner.

**2026-07-19 — Q3 answered: API-ONLY LAUNCH.** No CUDA torch build, no local model weights. Build
the fal.ai + Replicate adapters first under the VHE-2 §7 capability interface; local hardware can
register later under the same interface. Independently validated the same day by the hardware
audit (`VHE-ISSUE-LOG-0005`): this machine has **no CUDA GPU**, so API-only is the only viable
path here regardless. The owner's `library/` was staged under an API-only profile consistent with
this answer, and includes fal.ai, Replicate, OpenAI, Google Gen AI, and ElevenLabs SDKs
(`VHE-ISSUE-LOG-0006`). Recorded by `CC-OPUS-01` on behalf of the project owner.

**2026-07-19 — Q2 partially informed, not formally answered.** The library's staged SDK set
(fal.ai, Replicate, OpenAI, Google Gen AI, ElevenLabs) is a strong signal of intended first
adapters, but the owner has not explicitly ranked them. Confirm before VHE-2 §7 adapter work.
A central owner-managed **API-key library** exists; rooms will be granted keys when needed — keys
never enter this project. Recorded by `CC-OPUS-01`.

**Still open: Q2 (formal ranking), Q4 (web-only vs desktop wrapper), Q5 (team size), Q6 (plugin
marketplace model).** Q4–Q6 do not block Phases 0–2. **With Q1 and Q3 answered, Phase 0 pre-flight
is unblocked.**
