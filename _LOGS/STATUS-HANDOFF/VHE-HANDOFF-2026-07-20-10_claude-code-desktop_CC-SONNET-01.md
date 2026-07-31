# VHE Handoff — 2026-07-20-10

| Field | Value |
|---|---|
| **Logged by** | `CC-SONNET-01` (Claude Sonnet 5) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 2026-07-20 midday–afternoon (EDT) |
| **Project phase** | §9.1 image inpaint core committed. **No new code this entry** — session-close packaging: a full backup, an Eli/Marcus review zip, and this room's open questions for the owner. |

**Keep this file short. Detail belongs in the numbered diary entries. Reference them by number.**

---

## ⭐ FOR THE NEXT ROOM — READ THIS FIRST

The owner is opening a **brand-new room** to continue this project and will not be present to make
judgment calls at session start the way earlier sessions assumed. **Your very first action after
reading the logs (this file + `CURRENT-STATUS.md` + `VHE-ISSUE-LOG-0020`) must be to ask the owner
about every item in "Open questions for the owner" below — in one message, before writing or
building anything.** This was the owner's explicit instruction for this handoff. Do not silently
pick an answer and proceed; do not assume "start §9.2" is authorized just because it was the
last-discussed option — ask first.

## Open questions for the owner

*(carried over verbatim from this session; nothing here has been answered yet)*

1. **Start §9.2 (video repair) now?** This session ended by asking the owner "do you want me to
   start §9.2 now?" — the owner redirected to packaging/handoff instead of answering. It is still an
   open yes/no. (§9.2 reuses §9.1's `compositeUnderMask` + prompt template; adds §6.3 frame
   extraction, §8 mask tracking, and either ProPainter (removal, default) or keyframe+RIFE
   (content-replace) — see `CURRENT-STATUS.md` → "Next action" for the honest testable/blocked split.)
2. **Provider API key.** Still the only thing blocking *real* (non-mock) provider calls anywhere in
   the pipeline (§7 routing + §9.1/§9.2 both work today against mock adapters only). BYOK key from the
   owner, or a grant from the central Soren Tools API-key library? Which provider first — fal.ai is
   head of the visual fallback order per `VHE-ISSUE-LOG-0018`.
3. **§17 Q4/Q5/Q6 — still open, not blocking, but never answered:** Q4 (desktop wrapper app?), Q5
   (team/multi-user?), Q6 (marketplace model?). See `VHE-ISSUE-LOG-0003`.
4. **Cost-defaults: config table vs. code.** §7 (`VHE-ISSUE-LOG-0018`/`0019`) says defaults for
   unknown-cost jobs should live in a "config table, not code." It was built as a plain data module
   (`packages/providers/cost-defaults.ts`) because the §2 schema is frozen and adding a table is an
   architecture change no builder should make alone. Does the owner want an actual DB `config` table
   (a future migration), or is the data-module form fine to keep permanently?
5. **§4 two delegated retry rulings (`VHE-ISSUE-LOG-0017`).** Two one-line, test-pinned, reversible
   deviations from the verbatim §4.1/§4.2 blueprint code were needed to make the retry path actually
   run (verbatim add-options made it unreachable). Confirm or overrule.
6. **§9.1 decisions to confirm (`VHE-ISSUE-LOG-0020`):**
   - "25% margin" was interpreted as 25% of the box's own width/height, grown on **each side**
     (so a tight box can roughly double in each dimension). Confirm this reading, or was "25%
     margin" meant as a smaller total pad?
   - The §11 "Apply = append an edit-graph node" step is **deferred** — §11 doesn't exist yet, so
     `runImageInpaint` only returns before/after candidates and never writes an edit-graph node.
     Fine to leave until §11 is actually built?
   - An inpaint crop that's still too large for a provider's `maxWidth`/`maxHeight` after the 25%-
     margin crop is currently just **routed around** (§7 filters out providers that can't hold it) —
     no downscale-before-submit/upscale-after step exists. Worth building, or acceptable as-is?
7. **4 AI-content fixtures still not delivered** (`bad_hand.png`, `garbled_text.png`,
   `melted_face_15s.mp4`, `bad_hand_6s.mp4` — `VHE-ISSUE-LOG-0009`/`0011`). Still the only reason
   `pnpm preflight` shows 4 FAILs instead of 0. Any update on delivery?
8. **`VHE-ISSUE-LOG-0007` — production worker topology** under the free-tier hosting constraint.
   Still fully open; blocks deployment only, not local build. Any direction yet?

**None of the above block continued local building** (§9.2's deterministic core doesn't need a
provider key or §11 — see `CURRENT-STATUS.md`). They block *decisions*, not code. But per the
owner's explicit instruction, ask before proceeding rather than assuming silence means "pick #1
and go."

---

**Blueprint sections followed:** none — packaging/handoff only, no blueprint work this entry.

**Current working state (one paragraph, factual):**
Repo on `master`, local only, no remote. **Working tree CLEAN** at commit `9c57867` ("gitignore the
owner progress-snapshot zip"), which sits on top of `1f2ec39` (§9.1 image inpaint) and `f687de5` (§7
logs follow-up). `pnpm test` → **42/42 pass**. Two zips were generated this entry (see below), both
git-ignored / outside git, regenerable, containing no secrets and no `library/`/`node_modules`
binaries.

**Completed this session (this entry only):**
- Wrote this handoff's "Open questions" block per the owner's explicit request, so the next room
  opens by asking rather than assuming.
- Generated a full project backup zip: `VHE-BACKUP-FULL_2026-07-20.zip` (project root) — built via
  `git archive HEAD`, i.e. exactly the 92 git-tracked files (source, blueprints `.docx`, fixtures,
  `_LOGS/`, configs). Deliberately excludes `library/` (37k files, ~900 MB, staged tooling — never
  walked, per the standing "never recursively scan `library/tools/`" rule), `node_modules/`,
  `.pnpm-store/`, vendor FFmpeg `.exe`, and `.env` — none of those are git-tracked, so `git archive`
  never touches them by construction.
- Generated an owner/Eli/Marcus review zip: `VHE-SECTION-9.1-ELI-REVIEW_2026-07-20.zip` (project
  root) — plain-English README + this session's open questions + `packages/repair/*` source+tests +
  the curated `_LOGS/*` entries + `SECTION-9.1.patch`/`.diff` (`f687de5..9c57867`) + `COMMITS.txt`.
  No secrets, no binaries.

**Tested — with actual results:**
- No code changed this entry; no test run needed. Last known-good: **42/42** (see handoff `-09`).

**Files created or changed:**
- `_LOGS/STATUS-HANDOFF/VHE-HANDOFF-2026-07-20-10_claude-code-desktop_CC-SONNET-01.md` — this file, created.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — overwritten, open-questions block moved to the top.
- `VHE-BACKUP-FULL_2026-07-20.zip` — created, project root, git-ignored, regenerable from `git archive HEAD`.
- `VHE-SECTION-9.1-ELI-REVIEW_2026-07-20.zip` — created, project root, git-ignored (matches the
  existing `VHE-SECTION-*-ELI-REVIEW_*.zip` pattern), regenerable from git + logs.

**Unfinished / left mid-work:**
- Nothing. This entry is pure packaging/handoff; no code is mid-refactor.

**Next recommended action:**
1. **Ask the owner the 8 open questions above, in one message, before building anything.**
2. Only after that: if authorized, §9.2 video repair is architecturally ready to start (see
   `CURRENT-STATUS.md` for the exact testable/blocked split — deterministic frame math + compositing
   is buildable and live-testable now; SAM/ProPainter/RIFE and real provider adapters are
   environment-blocked, not effort-blocked).

**Blockers, warnings, dependencies, open decisions:**
- See "Open questions for the owner" above — that list *is* the blocker list for this entry.
- 🚨 System FFmpeg 8.1.2 on PATH — never bare `ffmpeg`. Python always `py -3.11`. **Never recursively
  scan `library/tools/`** (confirmed again this entry: broad `du`/`find` across the repo root
  including `library/` hung a shell command for 2 minutes and had to be abandoned — always exclude
  `library/` explicitly or use `git ls-files`/`git archive` instead of directory-walking tools).
- fnm not reliably on PATH this session; pinned node invoked directly (see `-09`).

**For deeper context, read these entries only:**
- `VHE-ISSUE-LOG-0020` — the §9.1 build this session's zips are packaging up.
- `VHE-ISSUE-LOG-0017`, `0018`, `0019` — the source of open questions 2, 4, 5 above.
