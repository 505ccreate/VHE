# VHE Handoff — 2026-07-19-04

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 17:19 – 18:15 EDT |
| **Project phase** | **Phase 0 — Pre-Flight, IN PROGRESS.** Gate CLOSED on 2 owner-material items only. |

---

**Blueprint sections followed:** VHE-2 §0 (scope ruling applied), §1 (fixtures + preflight), §6.3
(golden-test fixture requirements), §16 (exit gate).

**Current working state:**
Repo at commit (see below) on `master`, local only, tree clean. All five open decisions from
0009/0010 were **ruled by the owner in-session**; mid-session the owner left for work and
**delegated remaining decisions** ("i trust your judgement make any other decisions your self to
make the app work") — three further decisions were taken under that delegation, all logged in
**0011**. Preflight: **PASS 10 / FAIL 4 / SKIP 4, exit 1** — the 4 FAILs are the owner-supplied
AI-content fixtures (pending file delivery), 3 SKIPs are unprovisioned hosted services, 1 SKIP is
the correctly-skipped local-GPU check.

**Completed this session:**
- Owner rulings captured: §0 fixture-authoring exemption (via committed script) · AI fixtures
  supplied-as-files · binaries checksum-pull · unverified devDeps removed · pnpm via corepack.
- `scripts/build-fixtures.ts` written — the *only* sanctioned home for fixture-generation FFmpeg
  commands. Built all 4 structural fixtures with vendored 7.1.1; checksums in
  `fixtures/CHECKSUMS.sha256`; fixtures **committed** (delegated decision).
- `scripts/preflight.ts`: SHA-256 pins for vendored binaries; real Postgres/Redis/S3 connection
  checks (pg/ioredis/@aws-sdk) reading `.env` via `process.loadEnvFile`; `.env.example` added.
- First `pnpm install` via corepack pnpm 11.4.0 → `pnpm-lock.yaml`, 12 deps at exact receipt
  versions; `msgpackr-extract` build approved in `pnpm-workspace.yaml` (delegated).
- Dev service route decided under delegation: **hosted free-tier** (Supabase Postgres/Storage,
  Upstash-class Redis) — library service bundles are Windows-unusable source tarballs; WSL has no
  distro; production topology still open per 0007.

**Tested — with actual results:**
- Fixture structure verified with vendored ffprobe: `ntsc_2997` exactly 30000/1001 × 330 frames ·
  `long_gop` keyframes at 0 and 250 only (§6.3 range [137..180] mid-GOP) · `no_audio` zero audio
  streams · `vfr_phone` avg 9000/299 vs nominal 30/1 (genuine VFR).
- Preflight under fnm Node 22.23.1: PASS 10 / FAIL 4 / SKIP 4, exit 1 (correct closed-gate state).
- `pnpm install` exit 0; `corepack pnpm --version` → 11.4.0.
- **Not tested:** service connection checks against live services (no credentials exist yet) —
  code-complete, SKIP paths verified only.

**Files created or changed:** see commits `a6fd7b6` + the session-close commit (this handoff,
0011, LOG-INDEX, CURRENT-STATUS). Key new files: `scripts/build-fixtures.ts`,
`fixtures/{ntsc_2997,vfr_phone,no_audio,long_gop}.mp4`, `fixtures/CHECKSUMS.sha256`,
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.env.example`.

**Unfinished / left mid-work:** Nothing half-written. Two owner-material items block the gate:
1. **Drop the 4 AI-content fixture files into `fixtures/`** (bad_hand.png, garbled_text.png,
   melted_face_15s.mp4, bad_hand_6s.mp4). Then record their sha256 into `fixtures/CHECKSUMS.sha256`
   and commit — after that, preflight [c] goes all-green.
2. **Provision hosted dev services + fill `.env`** (copy `.env.example`): Supabase project
   (Postgres 16 + Storage) and a hosted Redis. Then preflight [b] flips SKIP → real PASS/FAIL.

**Next recommended action (for the next room):**
1. If the owner has supplied fixtures/credentials: verify (checksums, preflight) and commit.
2. Preflight all-green → Phase 0 exit gate opens → §2 migrations become legal. Not before.
3. §17 Q2 provider ranking still needed before §7 adapter work (0003).

**Blockers, warnings, dependencies, open decisions:**
- 🚨 System FFmpeg 8.1.2 on PATH — never bare `ffmpeg`; preflight warns.
- fnm invocation from tool shells: use
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe exec --using 22.23.1 -- node …`
  (winget PATH shim not visible in every shell). Prefix its node dir onto PATH for `corepack`.
- pnpm build-script approvals live in `pnpm-workspace.yaml` `allowBuilds` (pnpm 11), not package.json.
- Production worker topology still open (0007). VHE-5 active/unfrozen.

**For deeper context, read these entries only:**
- `VHE-ISSUE-LOG-0011` — everything this session decided and built, with the delegation record
- `VHE-ISSUE-LOG-0009` / `0010` — appended corrections carry the owner rulings
