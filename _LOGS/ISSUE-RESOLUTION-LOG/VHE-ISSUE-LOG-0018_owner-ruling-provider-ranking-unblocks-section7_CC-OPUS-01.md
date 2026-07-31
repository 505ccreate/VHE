# VHE-ISSUE-LOG-0018  —  Owner ruling (via Eli/ChatGPT): §17 Q2 provider ranking answered — unblocks §7

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0018 |
| **Date / time** | 2026-07-20 ~11:00 EDT |
| **Logged by** | `CC-OPUS-01` (Claude Opus 4.8) |
| **Platform / room** | Claude Code — Desktop, Windows 11, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §17 Q2, §7 · VHE-4 (audio providers) · §6.1 (frame math) |
| **Category** | Decision |
| **Status** | **RESOLVED** (ruling recorded; §7 build proceeds under it) |

---

## 1. What happened

The single decision that had blocked §7 across the last three sessions — VHE-2 §17 Q2, the provider
ranking (tracked in `VHE-ISSUE-LOG-0003`) — was answered by the owner this session, relayed through
the owner's helper "Eli" (via ChatGPT). The owner delegated the framing to Eli; the text below is the
owner's ruling as received in chat. Recorded verbatim in substance so no future room re-litigates it.

**Ruling 1 — provider routing (unblocks §7):**
- Routing stays **capability-filtered**, NOT one blind universal ranking.
- **Visual-repair** adapter build order / provisional fallback chain:
  **fal.ai → Replicate → Google → OpenAI.**
- **ElevenLabs is audio-only** — implement it with the **VHE-4** audio providers, not as a
  visual-repair fallback.
- The **user's explicitly selected / default provider always comes first** (this is exactly §7's
  `is_default_for` head-of-chain rule; the ranking above is only the tiebreak when no default applies).
- Providers **without a connected key or without the requested capability are skipped automatically**
  (again matches §7's "filter … whose manifest satisfies the request").
- **Audio defaults:** **Google → OpenAI → ElevenLabs.** Google is first because the platform will use
  **Gemini Charon for CAM**. **Voice cloning stays disabled by default** and may route only to an
  explicitly capable provider under the existing consent requirements (VHE-4).

**Ruling 2 — the four AI-content fixtures:**
- Owner will supply them **later as frozen files** taken from existing failed AI generations:
  `bad_hand.png`, `garbled_text.png`, `melted_face_15s.mp4`, `bad_hand_6s.mp4`.
- **Do not generate them with a project API key.** **Do not block §7** waiting for them.
- Record their sha256 checksums when delivered (same handling as every other frozen fixture).

**Ruling 3 — carry-forward + one new test requirement:**
- Keep the previously approved decisions: **PostgreSQL 17** (`0012`), the **fixture-gate waiver**
  (`0012`), and the **§6.1 half-millisecond fix** (`0013`).
- **NEW:** add boundary tests around **arbitrary integer-millisecond seeks at 30000/1001 and
  60000/1001 fps** so the §6.1 frame-math deviation is covered beyond the existing round-trip test.

## 2. Why it matters

§7 (BYOK provider adapters + capability routing) is the wall in front of §8/§9/§10 — nothing on the
visual-repair path can be built without a routing order. Ruling 1 removes that wall. Ruling 1 also
confirms the routing *shape* already assumed in §7's own text (default-first, capability-filtered,
skip-if-no-key), so the §7 engine can be built as written; the fal→Replicate→Google→OpenAI order is
the only genuinely new datum, and it is a **default fallback order**, not a hard-coded universal
priority — it applies only after the owner's `is_default_for` choice and capability filtering.

The audio ordering (Google→OpenAI→ElevenLabs) belongs to VHE-4, not §7, and is recorded here only so
the §7 visual routing does NOT accidentally treat ElevenLabs as a visual fallback.

## 3. Attempted solutions

Not an error — a decision. Prior state: `0003` had Q2 open; `-05`/`-06`/`-07` handoffs each re-asked
the "Eli question" and each time the owner was unavailable, so §7 stayed blocked and the last two
sessions took no-owner fallback work (§5 masks, then the §4 BullMQ transport). This session the answer
arrived.

## 4. Resolution

Ruling recorded here. Actions taken / to take under it:

1. **§7 build proceeds** with this routing contract:
   - filter connections by capability + dims/duration/mask (verbatim §7 "Routing" para);
   - `is_default_for` choice first;
   - then, for any remaining eligible providers with no owner default, order by the **visual
     fallback ranking** `['fal', 'replicate', 'google', 'openai']`;
   - empty chain → `NO_PROVIDER` before any spend.
2. **ElevenLabs is NOT registered in the visual registry.** It is reserved for VHE-4 audio work.
3. **Audio default order** `['google', 'openai', 'elevenlabs']` recorded for the VHE-4 room; not
   implemented here.
4. **4 fixtures:** unchanged from `0009`/`0011` — remain tracked debt; sha256 appended on delivery;
   preflight stays PASS 13 / FAIL 4 / SKIP 1 until then. §7 does not wait on them.
5. **§6.1 boundary tests** added per Ruling 3 (see §6 below for the file).

**Open sub-decision flagged, NOT assumed (anti-drift):** §7's text says the per-capability cost
defaults live in a **"config table, not code."** The §2 schema is frozen and has **no config table**,
and adding one is an architecture change I must not make unilaterally. This session implements the
cost defaults as a **versioned data module** (`packages/providers/cost-defaults.ts` — data, not
branching logic), which honors the "not code / editable as configuration" intent without a schema
migration. If the owner wants these in a DB table, that is a future migration. Logged so it is a
visible decision, not a silent pick.

## 5. Verification

Ruling text: received in chat this session, transcribed above. `NOT INDEPENDENTLY VERIFIABLE` beyond
the chat record — it is a human decision, not a testable claim. The §7 code built under it, and the
§6.1 boundary tests from Ruling 3, are verified in their own entries / test runs (see the handoff).

## 6. Affected files / components / tests

- `_LOGS/LOG-INDEX.md` — 0018 row claimed; Q2 open-item line to be closed on session end.
- `packages/providers/*` — §7 build carried out under Ruling 1 (see handoff for the file list).
- `packages/media/ffmpeg.test.ts` (or a dedicated frame-math test) — §6.1 fps boundary tests per
  Ruling 3.
- Blueprint: VHE-2 §7, §17 Q2; VHE-4 audio providers.

## 7. Prevention

The three-session "ask Eli again" churn is the harvest lesson: a single unanswered owner decision can
stall a build for multiple sessions while fallback work is consumed. The `CURRENT-STATUS.md`
"FIRST ACTION — ask the owner" banner worked (the question kept getting asked); what it could not do
is unblock without the human. No tooling fix — this is inherent to a BYOK product whose defaults are
the owner's call. Kept as a record of why §7 waited.

## 8. Related entries

- `VHE-ISSUE-LOG-0003` — the §17 decision tracker; Q2 is now answered by this entry.
- `VHE-ISSUE-LOG-0009` / `0011` — the 4 AI fixtures; Ruling 2 confirms supply-as-frozen-files.
- `VHE-ISSUE-LOG-0012` — PG17 + fixture-gate waiver, reaffirmed by Ruling 3.
- `VHE-ISSUE-LOG-0013` — §6.1 half-ms fix, reaffirmed + extended with boundary tests by Ruling 3.
- `VHE-ISSUE-LOG-0017` — the §4 transport built while §7 was blocked; its two rulings still await
  owner review (independent of this entry).

---

## Appended corrections

_(none)_
