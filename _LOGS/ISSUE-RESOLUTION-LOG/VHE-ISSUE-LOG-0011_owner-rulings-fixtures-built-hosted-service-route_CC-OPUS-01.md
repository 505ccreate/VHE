# VHE-ISSUE-LOG-0011  —  Owner rulings applied: structural fixtures built; toolchain locked; hosted dev-service route chosen under delegated authority

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0011 |
| **Date / time** | 2026-07-19 18:05 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §0, §1, §6.3 (golden-test fixture), §16 |
| **Category** | Resolution / Decision record |
| **Status** | **RESOLVED** (this session's scope) — Phase 0 gate still CLOSED on 2 owner-material items |

---

## 1. What happened

The owner was present at session start (17:19 EDT) and ruled on all five open decisions from
0009/0010. Mid-session (~17:40 EDT) the owner left for work and **delegated remaining decisions**,
verbatim intent: *"i trust your judgement make any other decisions your self to make the app work."*
Everything below is either a direct owner ruling (marked **OWNER**) or a decision taken under that
delegation (marked **DELEGATED**), each logged with rationale and reversible on owner review.

### Rulings and decisions

1. **OWNER — §0 FFmpeg scope:** fixture authoring is exempt from "never invent an FFmpeg command",
   conditional on all generation commands living in one committed script. → `scripts/build-fixtures.ts`.
2. **OWNER — AI-content fixtures:** owner supplies the 4 files frozen (no image-gen key for this
   room). Checksums to be recorded on receipt. **Still pending delivery.**
3. **OWNER — vendored binaries:** checksum-pull route. SHA-256 pins added to `scripts/preflight.ts`
   (ffmpeg `b902…2997`, ffprobe `05e8…a8ed`, computed from the library staged copy; vendor copies
   verified byte-identical). `vfr_phone.mp4` synthesized; a real capture may replace it later.
4. **OWNER — devDependencies:** unverified `tsx`/`typescript`/`@types/*` removed from
   `package.json`; receipt-verified `vitest 4.1.10` stays. npm scripts now use
   `node --experimental-strip-types`.
5. **OWNER — pnpm:** corepack activation of the pinned 11.4.0 (global 10.30.1 untouched).
6. **DELEGATED — msgpackr-extract build script:** approved in `pnpm-workspace.yaml` `allowBuilds`
   (bullmq's optional native accelerator; prebuilt-binary install; blocked by pnpm 11's default).
7. **DELEGATED — dev service route (closes the 0005 §4.4–4.6 / 0007 dev-side question):**
   **hosted free-tier services for dev**, matching the owner's standing hosting direction:
   Supabase (Postgres 16 + S3-compatible Storage) and an Upstash-class hosted Redis.
   Basis: the library `service-postgres` / `service-redis` bundles are **source tarballs**
   (unusable on Windows, per 0005); WSL has **no distro installed** (verified: `wsl -l -v` exit 50);
   Docker absent; builders cannot create accounts on the owner's behalf — so every local route
   needed either an owner account anyway or system installs contradicting the stated direction.
   **Production worker topology remains open (0007) — this decides dev only.**
8. **DELEGATED — fixtures are committed to git** as frozen bytes with `fixtures/CHECKSUMS.sha256`
   (~4.3 MB for the structural four). Rationale: rooms must share byte-identical fixtures or
   pixel-comparison golden tests silently diverge; a checksum file without the bytes can't restore
   them. The 175 MB binaries stay out (ruling 3) — size, not principle, distinguishes the cases.

## 2. Why it matters

These were the last decidable blockers on the Phase 0 exit gate. After this session the gate is
closed on exactly **two owner-material items**: delivery of the 4 AI-content fixture files, and
service credentials (Supabase/Redis/S3) for `.env`.

## 3. Attempted solutions

- `fnm` was not on the tool-shell PATH (winget Links shim absent there). Located directly at
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe`;
  invoked via `fnm exec --using 22.23.1`. Prefixing the fnm node dir onto PATH exposes `corepack`.
- First `pnpm install` exited 1 on `ERR_PNPM_IGNORED_BUILDS` (msgpackr-extract). `pnpm` field in
  `package.json` is **not** honored by pnpm 11.4.0 for this — it scaffolds and reads
  `pnpm-workspace.yaml` `allowBuilds`. Setting it true → clean install, exit 0.
- `build-fixtures.ts` first ran under system Node 24 by accident (fnm not on that shell's PATH).
  Harmless — the script only shells out to the vendored ffmpeg — but noted for honesty. Preflight
  itself was run under fnm Node 22.23.1.

## 4. Resolution

Built and verified this session (commit `a6fd7b6`):

- `scripts/build-fixtures.ts` — the sanctioned home for fixture-generation FFmpeg commands.
  Refuses to overwrite without `--force`; never touches the 4 AI-content fixtures; records
  checksums into `fixtures/CHECKSUMS.sha256`; refuses any ffmpeg that isn't 7.1.1.
- 4 structural fixtures generated with vendored 7.1.1 and **verified with vendored ffprobe**:
  - `ntsc_2997.mp4` — `r_frame_rate` exactly `30000/1001`, 330 frames
  - `long_gop.mp4` — 300 frames @ 25/1; keyframes at frames 0 and 250 **only** (keyint=250
    confirmed; the §6.3 golden-test range [137..180] sits mid-GOP as intended)
  - `no_audio.mp4` — zero audio streams
  - `vfr_phone.mp4` — deterministic timestamp jitter; `avg_frame_rate 9000/299` ≠ nominal `30/1`
    → genuinely VFR
- `scripts/preflight.ts` — added SHA-256 binary pins; replaced the [b] stub with real connection
  checks (pg `SELECT version()` asserting PG16 · ioredis `INFO` asserting server ≥ 7 · S3
  HeadBucket/ListBuckets), reading `.env` via `process.loadEnvFile` (no new dependency).
  `.env.example` documents the variables; `.env` remains gitignored.
- First `pnpm-lock.yaml` — all 12 receipt-verified deps at exact pinned versions.

## 5. Verification

- `node --experimental-strip-types scripts/build-fixtures.ts` (vendored 7.1.1): 4 BUILT, 0 failed.
- ffprobe structural verification: outputs quoted in §4 above — actually run, not assumed.
- `fnm exec --using 22.23.1 -- node --experimental-strip-types scripts/preflight.ts` →
  **PASS 10 / FAIL 4 / SKIP 4, exit 1**. FAILs are exactly the 4 owner-supplied AI fixtures;
  SKIPs are the 3 unprovisioned services + the correctly-skipped local-GPU check.
- `corepack pnpm --version` → 11.4.0 · second `pnpm install` → exit 0, msgpackr-extract built.
- **Not verified:** the service checks against a live Postgres/Redis/S3 (no credentials exist yet);
  they are code-complete and exercise their SKIP paths cleanly.

## 6. Affected files / components / tests / commits

- Commit `a6fd7b6` (15 files): `scripts/build-fixtures.ts` (new), `scripts/preflight.ts`,
  `package.json`, `pnpm-lock.yaml` (new), `pnpm-workspace.yaml` (new), `.env.example` (new),
  `.gitignore`, `fixtures/{4 mp4 + CHECKSUMS.sha256}` (new), 0009/0010 appended corrections.
- Unblocks: §6.3 golden test (`long_gop.mp4` now exists), §6.4 golden test 2 (`no_audio.mp4`).

## 7. Prevention

- pnpm 11 build-script approvals belong in `pnpm-workspace.yaml`, not `package.json` — recorded
  here so the next room doesn't re-derive it.
- Tool shells don't inherit winget PATH edits; the fnm invocation recipe in §3 works from any shell.
- Delegation events should be logged verbatim with their interpreted scope (see §1) so a future
  reader can distinguish "owner ruled" from "builder judged under delegation".

## 8. Related entries

- `VHE-ISSUE-LOG-0009` / `0010` — the blockers these rulings close (appended corrections there)
- `VHE-ISSUE-LOG-0005` — Windows-unusable service bundles; toolchain identity rules
- `VHE-ISSUE-LOG-0007` — hosting direction; production worker topology **still open**
- `VHE-ISSUE-LOG-0006` — key policy: credentials never enter the repo

---

## Appended corrections

**2026-07-19 ~23:40 EDT — `CC-OPUS-01` — service credentials partially wired; S3 verified live.**
The owner pointed to a credential file in the central library
(`…\Soren-Tools-Library-V1 - TRANSFER 2026-07-17\supabase.txt`) and directed that its contents be
placed into a self-created `.env`. Done — `.env` created (gitignored; `git check-ignore` confirms;
never committed). Contents of the source file were **incomplete in three places**, so only S3 could
be completed:

- **S3 / Supabase Storage — PASS (verified live).** Endpoint + access key + secret were complete.
  Preflight now performs a real `ListBuckets` against
  `https://podlvtrckyolovvgljey.storage.supabase.co/storage/v1/s3` and it **succeeds** with
  `S3_REGION=us-east-1`. This is an actual connection, not a SKIP. (`S3_BUCKET` left unset → the
  check is ListBuckets, not a bucket-level HeadBucket; set a bucket later for the tighter check.)
- **Postgres — still SKIP.** The source file's connection string contained the literal
  `[YOUR-PASSWORD]` placeholder; the real DB password was not provided. `DATABASE_URL` left blank.
  Known parts recorded as a commented template in `.env`
  (host `db.podlvtrckyolovvgljey.supabase.co`, port 5432, db/user `postgres`).
- **Redis — still SKIP.** The source file's `REDIS_URL` line was **truncated mid-string** (file
  ends at `…@arriving-fox-169017.ups`, no closing quote — a paste truncation). `REDIS_URL` left
  blank with a commented template.

Not done, deliberately: retrieving the missing DB password (would require a Supabase password
**reset** — an account change) or the full Redis URL (authenticated Upstash dashboard) via browser
while the owner is asleep. Both need the owner present. Preflight now **PASS 11 / FAIL 4 / SKIP 3**.

**Two small owner actions remain to finish [b]:** paste the real Postgres DB password into
`DATABASE_URL`, and paste the full untruncated `rediss://` URL into `REDIS_URL` (both templated in
`.env`). The 4 AI-content fixtures remain the other gate blocker.

---

**2026-07-20 ~00:20 EDT — `CC-OPUS-01` — all 3 services now CONNECT; new blocker: Supabase is
Postgres 17.6, stack pins 16.**

The owner updated `supabase.txt` with the DB password and confirmed the Redis line was complete.
Diagnosis and fixes from this pass (all verified by live preflight runs, not assumed):

1. **Redis — PASS (server 8.2.0).** The file's host was in fact still truncated: DNS lookup showed
   `arriving-fox-169017.ups` NOT FOUND but `arriving-fox-169017.upstash.io` resolving (7 A records).
   Completed the host + standard `:6379` TLS port in `.env`. **Also fixed a real preflight bug this
   surfaced:** ioredis on an unresolvable host retry-looped forever and hung the process past the
   summary (first run had to be killed). The [b] Redis check now sets `retryStrategy: () => null`,
   `maxRetriesPerRequest: 0`, `enableOfflineQueue: false`, swallows `error` events, and
   `disconnect()`s in `finally` — one-shot semantics, matching what a gate check should be.
2. **Postgres — connects & authenticates, FAILs the version pin.** Root cause of the original
   ENOTFOUND: the direct host `db.podlvtrckyolovvgljey.supabase.co` is **IPv6-only** (AAAA only, no
   A record — verified by DNS) and this machine has no IPv6 route. Switched `DATABASE_URL` to
   Supabase's IPv4 Supavisor pooler: user `postgres.podlvtrckyolovvgljey` @
   `aws-0-us-east-1.pooler.supabase.com:5432` (region inferred from the direct host's AWS US-East
   IPv6 block; confirmed by successful auth). `SELECT version()` returns **PostgreSQL 17.6** —
   VHE-2 pins **Postgres 16**, so the check correctly FAILs on identity-not-presence grounds.
3. **S3 — still PASS.**

Preflight: **PASS 12 / FAIL 5 / SKIP 1** (4 AI fixtures + the PG-version mismatch; the sole SKIP is
the correctly-skipped local-GPU check — nothing is SKIP-for-undecided anymore).

**🔴 NEW OWNER DECISION — Postgres 17.6 vs the Postgres 16 pin (VHE-2 §0/§17 Q1):** Supabase free
tier provisions PG 17 and does not offer a version picker on new projects. Options: (a) accept
PG 17 for hosted dev/prod and amend the pin via an authorized blueprint revision (drizzle/pg are
compatible; 17 is a superset for our use — but this is an architecture-pin change, exactly the kind
§0 says the owner must authorize); (b) hold the 16 pin and source a PG-16 host elsewhere. The
builder recommendation is (a), recorded here, **not enacted** — the pin stays 16 and the check
stays FAIL until the owner rules.
