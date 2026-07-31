# VHE-ISSUE-LOG-0009  —  The 8 test fixtures cannot be built in this room; two independent blockers

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0009 |
| **Date / time** | 2026-07-19 15:20 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §0 (no invented FFmpeg), §1 (fixtures), §6 (the wrapper), §16 (Phase 0 exit gate) |
| **Category** | Blocker / Decision |
| **Status** | **UNRESOLVED** — needs the project owner. Blocks the Phase 0 exit gate. |

---

## 1. What happened

`CURRENT-STATUS.md` listed building the fixtures as a pre-flight step, described as "**not** in the
library, build by hand". Attempting that step this session surfaced two separate blockers that make
it impossible to complete here. Neither is a tooling failure — both are rule/access constraints.

### Blocker A — four fixtures require AI-generated content, and this room has no API keys

VHE-2 §1 specifies these by their *content*, not their container:

| Fixture | §1 description | Can this room produce it? |
|---|---|---|
| `bad_hand.png` | "**AI image** with 6-finger hand" | ✗ needs an image-gen provider |
| `garbled_text.png` | "**AI image** with unreadable logo text" | ✗ needs an image-gen provider |
| `melted_face_15s.mp4` | "clip with **face degradation** mid-clip" | ✗ needs generated/degraded face footage |
| `bad_hand_6s.mp4` | "clip containing a **visibly wrong hand**" | ✗ video counterpart of `bad_hand.png` |

These are not synthesizable with FFmpeg test sources — the whole point is that they contain the
specific *AI-artifact pathologies* the product exists to detect and repair. A color-bar pattern with
a rectangle drawn on it would technically probe fine and would test nothing.

Per `VHE-ISSUE-LOG-0006`, the owner holds API keys in a central library and grants them per room.
**This room has been granted none.** No key is present, and per the standing rule none may be stored
in-project.

### Blocker B — generating the other four means inventing FFmpeg commands, which §0 forbids

The remaining four (`ntsc_2997.mp4`, `vfr_phone.mp4`, `no_audio.mp4`, `long_gop.mp4`) are structural
rather than content-based, and are the kind of thing FFmpeg synthesizes readily (`testsrc`,
`-g 250`, `-an`, and so on).

But VHE-2 §0 is unambiguous:

> "Never invent an FFmpeg command. Every FFmpeg invocation in the entire product goes through the
> wrapper in §6. If a command you need isn't in §6, stop and flag it — do not compose one."

§6 was read this session to check whether fixture generation is covered. It is **not**. §6.1 is
frame↔time math; §6.2 extracts a true last frame; §6.3 extracts a frame range; §6.4 splices repaired
frames back. Every §6 recipe *operates on media that already exists*. There is no synthesis recipe,
and no `testsrc`, anywhere in §6.

So building even the "easy" four requires composing FFmpeg commands that §6 does not define. §0 says
the response to that is to stop and flag — which is what this entry is.

**This is arguably a gap in the blueprint rather than a contradiction:** §0's rule is scoped to "the
entire product", and fixture generation is test-authoring, not product code. But that is an
interpretation, and the project rules forbid resolving ambiguity by inference. The owner should rule
on it explicitly.

## 2. Why it matters

The fixtures are the Phase 0 exit gate. VHE-2 §1 calls them "the real test suite" and §16 gates Phase
0 on "fixture uploads → ready with correct fps/frame_count". Three of the four structural fixtures
exist specifically to kill entire bug classes that are otherwise invisible:

- `ntsc_2997.mp4` — kills float-fps bugs (the 30000/1001 rounding class §0 and §6.1 are built around)
- `long_gop.mp4` — kills seek-accuracy bugs; §6.3's mandatory golden test **runs on this file by name**
- `vfr_phone.mp4` — variable frame rate, the case that breaks naive timestamp math

**Until these exist, §6 cannot be validated at all.** §6.3's golden test is specified against
`fixtures/long_gop.mp4` directly. §6 is Phase 0 scope. So this blocker sits on the critical path, not
off to the side.

`vfr_phone.mp4` deserves separate mention even if Blocker B is waived: genuine variable-frame-rate
capture with irregular phone-camera timestamps is difficult to fake convincingly. A real capture from
an actual phone is likely to be a better fixture than anything synthesized, and the owner may simply
be able to supply one.

## 3. Attempted solutions

1. **Attempt:** Check whether the fixtures are already staged in the owner's `library/`.
   **Result:** No. Confirmed against `library/manifest.json` receipts — the 52 bundles are runtimes,
   binaries, npm/py packages, fonts and QA tools. `VHE-ISSUE-LOG-0006` already records that "test
   fixtures and MinIO are deliberately absent."
2. **Attempt:** Determine whether the four structural fixtures could be generated within existing
   rules by checking §6 for a synthesis/generation recipe.
   **Result:** None exists. §6.1–§6.4 all operate on pre-existing input. Blocker B confirmed by
   reading the section rather than assuming its contents.
3. **Considered:** Compose the four FFmpeg generation commands anyway, on the reading that §0's rule
   governs product code and fixture authoring is tooling.
   **Not done deliberately.** That reading is probably correct, but it is exactly the "reasonable
   default" that `SESSION-PROTOCOL.md` §4 classes as a drift event. Composing FFmpeg commands is also
   the single most explicitly forbidden improvisation in the entire blueprint. Flagged instead.
4. **Considered:** Substitute placeholder/synthetic media for the four AI-content fixtures so the
   pre-flight script goes green.
   **Not done deliberately.** This would produce a green Phase 0 gate over a test suite that tests
   nothing — worse than a red gate, because it is a false signal that survives into later phases.

## 4. Resolution

**Unresolved. Requires the project owner.** Three decisions, in priority order:

1. **Blocker B ruling (cheap, unblocks 4 fixtures immediately):** Does §0's "never invent an FFmpeg
   command" govern *fixture-authoring scripts*, or only product code? If fixture authoring is exempt,
   the next builder can generate `ntsc_2997`, `no_audio`, and `long_gop` in minutes with the vendored
   7.1.1 binary. **Recommendation:** grant the exemption but require the generation commands to live
   in one committed, reviewed script (`scripts/build-fixtures.ts`) rather than being typed ad hoc —
   so they are auditable and reproducible, which is the spirit of the §6 rule.
2. **Blocker A (needs owner action, not just a ruling):** grant this room an image-gen API key, or
   supply the four AI-content fixtures directly as files. Note that supplying them as files is
   arguably *better*: fixtures should be stable and identical across rooms, and regenerating them
   from a model would produce a different image every time — which would silently invalidate any
   pixel-comparison golden test built against them.
3. **`vfr_phone.mp4`:** consider supplying a real phone capture rather than a synthesized VFR file.

Until 1 and 2 are answered, the Phase 0 exit gate stays CLOSED and §6 work cannot be validated.

## 5. Verification

`NOT VERIFIED — nothing was built.` No fixture was created this session, and no FFmpeg generation
command was composed or executed.

What *was* verified is the blocker itself: `scripts/preflight.ts` was run and reported all eight
fixtures as FAIL / "not built yet", correctly closing the Phase 0 gate. Actual output is captured in
`VHE-ISSUE-LOG-0010` §5. The absence of a synthesis recipe in §6 was verified by direct read of
§6.1–§6.4, not assumed.

## 6. Affected files / components / tests / commits

- `fixtures/` — created, **empty**. No fixture exists.
- `scripts/preflight.ts` — check (c) reports all 8 as FAIL and points here
- Blocks: VHE-2 §1 exit gate, §6.3 golden test (needs `fixtures/long_gop.mp4` by name), §16 Phase 0
- Blocks later: §9.4 Anomaly Auto-Detect (needs `bad_hand_6s.mp4`)

## 7. Prevention

**Blueprint clarification worth making permanently:** VHE-2 §0's FFmpeg rule should state its scope
explicitly — "every FFmpeg invocation *in product code*" vs "*anywhere in the repository*". As
written, it is strict enough to block the test-suite construction that §1 requires in the same
document. Any builder who follows §0 literally hits this same stop, and will hit it again in every
room until the sentence is scoped.

**Process point:** §1 mixes two very different kinds of fixture — structurally-defined ones a builder
can generate, and content-defined ones that require a model and credentials. Only the first kind is
"build by hand" work. A blueprint that separated them would have surfaced the credential dependency
at planning time rather than at the exit gate.

**Fixture stability:** if the AI-content fixtures are ever regenerated rather than stored, every
pixel-comparison golden test built on them silently breaks. Whatever route the owner picks, the four
AI fixtures should be **frozen binary artifacts with recorded checksums**, exactly like the vendored
FFmpeg build — not regenerated per room.

## 8. Related entries

- `VHE-ISSUE-LOG-0008` — the fixture count (8, not 7); read together with this entry
- `VHE-ISSUE-LOG-0006` — the library, and why fixtures/keys are deliberately absent from it
- `VHE-ISSUE-LOG-0010` — the pre-flight script that reports this blocker
- `VHE-ISSUE-LOG-0003` — Q2 provider ranking, the other open owner decision touching API access

---

## Appended corrections

**2026-07-19 17:25 EDT — `CC-OPUS-01` — Owner rulings received in-session. Status: PARTIALLY RESOLVED.**

The owner ruled on all three §4 decisions in the 17:19 session:

1. **Blocker B — RESOLVED.** §0's "never invent an FFmpeg command" governs product code only;
   fixture-authoring is exempt, **on the condition that every generation command lives in one
   committed, auditable script** (`scripts/build-fixtures.ts`) — never typed ad hoc. This adopts the
   §4 recommendation verbatim. The 4 structural fixtures (`ntsc_2997.mp4`, `vfr_phone.mp4`,
   `no_audio.mp4`, `long_gop.mp4`) are now buildable in-room.
2. **Blocker A — ROUTE DECIDED, delivery pending.** The owner will **supply the 4 AI-content
   fixtures as frozen files** (no image-gen API key for this room). They remain FAIL until the files
   arrive; checksums are to be recorded on receipt so they are never regenerated.
3. **`vfr_phone.mp4` — SYNTHESIZE.** Build it in `scripts/build-fixtures.ts`; a real phone capture
   may replace it later (checksum re-recorded if so).

Status header above remains as filed; effective status is now **PARTIALLY RESOLVED — Blocker B
closed, Blocker A awaiting file delivery from the owner.** Phase 0 exit gate still CLOSED (4
AI-content fixtures + service route outstanding).
