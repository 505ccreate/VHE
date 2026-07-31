# VHE Handoff — 2026-07-19-03

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 14:55 – 15:45 EDT |
| **Project phase** | **Phase 0 — Pre-Flight, IN PROGRESS.** First code exists. Exit gate **CLOSED**. |

---

**Blueprint sections followed:** VHE-2 §0, §1 (pre-flight), §6 (read only, to check for a fixture
recipe), §16 (exit gate definition).

**Current working state:**
The project is a git repo with a scaffold, a pinned toolchain, and a working pre-flight script.
`scripts/preflight.ts` runs and reports **PASS 4 / FAIL 8 / SKIP 2, exit 1 — gate CLOSED**. That is
the honest state, not a malfunction: the 8 FAILs are the 8 unbuilt fixtures and the 2 SKIPs are the
undecided service route. No dependency has been installed; no commit has been made.

**Completed this session:**
- `git init` + scaffold: `.gitignore`, `.node-version`, `package.json`, `scripts/`, `fixtures/`, `vendor/ffmpeg/`.
- Vendored FFmpeg **7.1.1** from `library/` and verified it is distinct from the forbidden system 8.1.2 → 0010.
- Node 22 route (0005 §4.2) **answered by owner** — version manager. fnm 1.39.0 → Node v22.23.1
  pinned; system Node 24.3.0 untouched → appended to 0005.
- Wrote `scripts/preflight.ts` asserting **identity, not presence**, per 0005 §7. It runs → 0010.
- `package.json` deps pinned to library-receipt-verified versions (all 11 named in §1).
- Caught a bad number in my own previous handoff: fixtures are **8, not 7** → 0008.
- Hit and flagged two hard blockers on fixture construction rather than improvising → 0009.

**Tested — with actual results:**
- FFmpeg identity: vendored → `7.1.1-essentials_build`; system PATH → `8.1.2-full_build`. **PASS.**
- Toolchain: fnm node `v22.23.1` · system node `v24.3.0` · pnpm `10.30.1` · `py -3.11` → `Python 3.11.9`.
- `node --experimental-strip-types scripts/preflight.ts` → **exit 1**, PASS 4 / FAIL 8 / SKIP 2.
  Full output quoted in `VHE-ISSUE-LOG-0010` §5.
- **Not tested:** no `pnpm install`, no lockfile, no dependency imported. `package.json` is a
  declaration that has never been resolved.

**Files created or changed:**
- Created: `.gitignore`, `.node-version`, `package.json`, `scripts/preflight.ts`,
  `vendor/ffmpeg/{ffmpeg.exe, ffprobe.exe, LICENSE}`, empty `fixtures/`, `.git/`
- Created: `_LOGS/ISSUE-RESOLUTION-LOG/` entries **0008, 0009, 0010**
- Updated: `_LOGS/LOG-INDEX.md`, `VHE-ISSUE-LOG-0005` (appended correction), `CURRENT-STATUS.md`
- `library/` — read only, **unmodified**

**Unfinished / left mid-work:**
Nothing is half-written. Work stopped at a flagged blocker, deliberately:
- `fixtures/` is empty. 4 fixtures need AI-generated content (no API key in this room); the other 4
  need FFmpeg commands §6 does not define, which §0 forbids composing. **See 0009 — this needs you.**
- `pnpm install` intentionally not run — would bake unverified `tsx`/`typescript`/`@types` versions
  into a lockfile. See 0010 §4 sub-decision 2.
- Working tree is **uncommitted**. First commit deliberately left to the owner, since the
  commit-vs-checksum question for the 175 MB of vendored binaries is unanswered (0010 §4 item 1).

**Next recommended action (for the new room):**
1. Get the owner to rule on the three items in the "Owner decisions" list below — item 1 is a
   one-sentence answer that unblocks 3 fixtures immediately.
2. Once ruled: write `scripts/build-fixtures.ts` for the structural fixtures, then re-run preflight.
3. Reconcile pnpm 10.30.1 (installed) vs 11.4.0 (library + `package.json` `packageManager`) before
   the first `pnpm install`.
4. Do **not** start §2 migrations. The gate is closed and §2 depends on the service route (0007).

**Blockers, warnings, dependencies, open decisions:**
- 🔴 **Owner decisions needed (0009):** (a) does §0's "never invent an FFmpeg command" cover
  *fixture-authoring scripts* or only product code? (b) grant an image-gen API key **or** supply the
  4 AI-content fixtures as files — supplying files is likely better, since regenerated fixtures would
  silently invalidate pixel-comparison golden tests. (c) `vfr_phone.mp4` — a real phone capture may
  beat anything synthesized.
- 🔴 **Owner decision (0010):** commit the 175 MB of vendored `.exe`, or pull by pinned checksum?
  Currently `.gitignore`d so the choice stays open.
- 🚨 System FFmpeg **8.1.2** still on PATH. Never invoke bare `ffmpeg`. Preflight now warns about it.
- ⚠️ pnpm version mismatch: installed 10.30.1 vs pinned 11.4.0 — will bite on first install.
- Still open from before: §17 Q2 provider ranking (blocks §7), Q4–Q6 (later phases),
  Postgres/Redis/MinIO route (0007, blocks the [b] preflight check).
- VHE-5 remains active/unfrozen — recheck before any lip-sync work.

**Note on signing:** the owner instructed this session to sign as "Eli Soren". Flagged as conflicting
with `AI-ACCOUNT-REGISTRY.md` (the registry identifies *builder accounts*, not the human owner, and
`CC-OPUS-01` was finalized for this account on 2026-07-19). Owner confirmed **keep `CC-OPUS-01`**.
Registry unchanged.

**For deeper context, read these entries only:**
- `VHE-ISSUE-LOG-0009` — the fixture blockers. **Read first; it is what needs an owner answer.**
- `VHE-ISSUE-LOG-0010` — what was built, exact verified output, and the three open sub-decisions
- `VHE-ISSUE-LOG-0008` — why the fixture count is 8 and not 7
- `VHE-ISSUE-LOG-0007` — only when the service route or deployment work begins

---

**Appended correction — 2026-07-19 15:58 EDT — `CC-OPUS-01`:** After this handoff was written, the
owner asked for the working tree to be committed. It now is: commit `8f32b32` on `master` (root
commit), 39 files, local only (no branch/remote/push). This supersedes the "working tree is
uncommitted" / "first commit deliberately left to the owner" statements above — those were true when
written. The vendored `.exe` binaries stayed `.gitignore`d and out of the commit, so the
commit-vs-checksum decision (0010 §4 item 1) is **still open**. Full record: `VHE-ISSUE-LOG-0010`
appended correction. `CURRENT-STATUS.md` reflects the committed state.
