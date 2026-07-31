# VHE Handoff — 2026-07-20-05

| Field | Value |
|---|---|
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Session window** | 17:19 EDT (2026-07-19) – 00:35 EDT (2026-07-20) |
| **Project phase** | **Phase 0 — Pre-Flight, IN PROGRESS.** Gate CLOSED on 5 checks: 4 AI fixtures + 1 PG-version decision. |

> **Incoming builder:** sign with **your own** ID from `AI-ACCOUNT-REGISTRY.md`, not `CC-OPUS-01`.
> If you are not listed, ask the owner — do not invent one.

---

**Blueprint sections followed:** VHE-2 §0, §1, §6.3, §16, §17 Q1 (the PG-version pin).

**Current working state:**
Repo at commit `6fee567` on `master`, local only, **tree clean**. Preflight:
**PASS 12 / FAIL 5 / SKIP 1**. All three hosted services now **connect live**; the 5 FAILs are the
4 owner-supplied AI-content fixtures plus one Postgres version-pin mismatch (see decision below).
The single SKIP is the correctly-skipped local-GPU check — nothing is SKIP-for-undecided anymore.

**`.env` exists on disk, gitignored, with WORKING credentials** (verified this session). It is not
in git by policy (`VHE-ISSUE-LOG-0006`). A new session **in this same directory/machine** inherits
it as-is. A fresh clone elsewhere would need it recreated from the owner's
`…\Soren-Tools-Library-V1 - TRANSFER 2026-07-17\supabase.txt` plus the two corrections in §Notes.

**Completed this session (full detail in `VHE-ISSUE-LOG-0011` + its 3 appended corrections):**
- Owner ruled the 5 open 0009/0010 decisions; mid-session **delegated** remaining calls.
- Built + ffprobe-verified the 4 structural fixtures via committed `scripts/build-fixtures.ts`;
  committed as frozen bytes with `fixtures/CHECKSUMS.sha256`.
- Toolchain locked: SHA-256 binary pins in preflight; corepack pnpm 11.4.0; first `pnpm-lock.yaml`;
  unverified devDeps removed.
- Wired all 3 services into preflight [b] with real connection checks; `.env` + `.env.example`.
- Diagnosed and connected all 3 services (see §Notes). Fixed a real preflight hang bug (ioredis).

**Tested — actual results:**
- `preflight.ts` under fnm Node 22.23.1 → **PASS 12 / FAIL 5 / SKIP 1**.
- Redis: PASS, server **8.2.0**. S3: PASS (ListBuckets). Postgres: authenticates, returns
  **PostgreSQL 17.6** → FAILs the "must be 16" assertion (by design).
- Fixture structure verified with vendored ffprobe (30000/1001×330; keyint=250 kf@{0,250};
  zero-audio; true VFR).

**Unfinished / left mid-work:** nothing half-written. Two owner-gated items remain (below).

**🔴 Owner decisions blocking the Phase 0 gate:**
1. **Deliver the 4 AI-content fixtures** into `fixtures/`: `bad_hand.png`, `garbled_text.png`,
   `melted_face_15s.mp4`, `bad_hand_6s.mp4`. Then append their sha256 to `fixtures/CHECKSUMS.sha256`
   and commit.
2. **Postgres 17.6 vs the 16 pin (VHE-2 §17 Q1).** Supabase free tier provisioned PG 17.6; no
   version picker. Builder recommendation: accept 17 and amend the pin via an authorized blueprint
   note (drizzle/pg compatible; 17 is a superset for our use). Held FAIL until the owner rules —
   a pin change is exactly what §0 reserves for the owner.

**Next recommended action (new room):**
1. Get the two rulings above. Each is a one-liner that unblocks its check.
2. If PG17 accepted: change `PIN`/version assertion in `scripts/preflight.ts` (the `major === '16'`
   check) per the ruling, re-run.
3. Fixtures delivered + PG ruled → preflight green (exit 0) → **Phase 0 gate opens → §2 migrations
   become legal.** Not before.
4. §17 Q2 provider ranking (0003) still needed before §7 adapter work.

**Notes / gotchas (verified this session):**
- **Postgres route:** direct host `db.podlvtrckyolovvgljey.supabase.co` is **IPv6-only** and this
  machine has no IPv6 → use the IPv4 Supavisor pooler already in `.env`:
  `postgresql://postgres.podlvtrckyolovvgljey:<pw>@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.
- **Redis:** the owner's file host was truncated (`.ups`); real host is `arriving-fox-169017.upstash.io:6379`.
- **fnm** is not on tool-shell PATH; invoke:
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe exec --using 22.23.1 -- node --experimental-strip-types scripts/preflight.ts`
- 🚨 System FFmpeg 8.1.2 on PATH — never bare `ffmpeg`. VHE-5 active/unfrozen. Production worker
  topology still open (0007).

**Read only these for depth:** `VHE-ISSUE-LOG-0011` (everything this session + the 3 corrections),
then `0009`/`0010` if you need the earlier rulings.
