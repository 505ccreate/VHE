# VHE-ISSUE-LOG-0010  —  Phase 0 scaffold built; toolchain pinned and verified; three sub-decisions open

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0010 |
| **Date / time** | 2026-07-19 15:35 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §1 (Pre-Flight), §16 (Phase 0 gate) |
| **Category** | Decision / Discovery |
| **Status** | **PARTIALLY RESOLVED** — scaffold and toolchain done and verified; gate still CLOSED on fixtures + services |

---

## 1. What happened

First session in which application-adjacent files were created. Until now the project had no repo and
no code (`VHE-ISSUE-LOG-0001`). Executed the pre-flight sequence from `CURRENT-STATUS.md` up to the
point where it blocked.

Completed: `git init`, repo scaffold, vendored FFmpeg 7.1.1, Node 22 pinned via a version manager,
`scripts/preflight.ts` written and **running**. Blocked at fixtures (`VHE-ISSUE-LOG-0009`) and
services (`VHE-ISSUE-LOG-0007`).

The pre-flight script exits non-zero and reports the gate as CLOSED. **That is the correct result,
not a failure** — it accurately reflects a project with no fixtures and no database.

## 2. Why it matters

`VHE-ISSUE-LOG-0005` §7 warned that a presence-only pre-flight check would pass on this machine while
three of four version pins were wrong. This session proves the warning was justified: the script
detects and reports the system FFmpeg 8.1.2 sitting on PATH alongside the correct vendored 7.1.1, and
would hard-fail if the vendored binary were ever swapped. The trap is now armed against itself.

## 3. Attempted solutions

1. **Attempt:** `git init` in the project root.
   **Result:** Success. Repo created. `git config user.name` → `elisoren428`.
2. **Attempt:** Vendor FFmpeg from `library/tools/binary-ffmpeg/`.
   **Result:** Bundle was already extracted (not a zip), so a plain copy sufficed. Copied
   `ffmpeg.exe`, `ffprobe.exe`, `LICENSE` into `vendor/ffmpeg/`. `ffplay.exe` deliberately **not**
   vendored — neither §1 nor §6 requires it, and it is another 87 MB.
3. **Attempt:** Install a Node version manager per the owner's route choice (`0005` §4.2).
   **Result:** `winget install --id Schniz.fnm` → success, fnm 1.39.0. Note it modifies PATH but the
   change does not reach an already-running shell; the binary had to be invoked by absolute path this
   session. A new shell will pick up `fnm` normally.
4. **Attempt:** `fnm install 22`.
   **Result:** Installed Node **v22.23.1** — which is *exactly* the version staged in the library as
   `runtime-node` 22.23.1. The two routes converge on the same build, so choosing the version manager
   cost nothing in fidelity. System Node 24.3.0 left untouched, as required.
5. **Attempt:** Run `scripts/preflight.ts`. The blueprint implies a TypeScript runner, but `tsx` and
   `typescript` are **not** in the library, and downloading them conflicts with the standing
   "check the library before downloading anything" rule.
   **Result:** Avoided the conflict entirely — Node 22 has native type-stripping
   (`--experimental-strip-types`), so the script runs with zero added dependencies. This is why
   `pnpm install` has not been run and no lockfile exists yet.

## 4. Resolution

Created this session:

| Path | Purpose |
|---|---|
| `.git/` | repo initialized |
| `.gitignore` | ignores `library/`, `.env*`, `vendor/ffmpeg/*.exe`, fixture media |
| `.node-version` | `22.23.1` — fnm reads this to pin the project |
| `package.json` | `engines.node: 22.x`, all 11 §1-named deps pinned to library-verified versions |
| `vendor/ffmpeg/` | `ffmpeg.exe`, `ffprobe.exe`, `LICENSE` — pinned 7.1.1 |
| `scripts/preflight.ts` | §1 verification script, asserts identity per `0005` §7 |
| `fixtures/` | created, empty — see `VHE-ISSUE-LOG-0009` |

`package.json` dependency versions were taken from `library/receipts/*.json` (`status: verified`) so
the manifest and the lockfile cannot drift: fastify 5.10.0 · bullmq 5.80.1 · ioredis 5.11.1 ·
pg 8.22.0 · drizzle-orm 0.45.2 · zod 4.4.3 · @aws-sdk/client-s3 3.1085.0 · sharp 0.35.3 · ws 8.21.0 ·
undici 8.7.0 · ulid 3.0.2.

### Three sub-decisions left open rather than decided unilaterally

1. **Vendored binaries: commit or checksum-pull?** §1 permits either ("committed to the repo under
   /vendor/ffmpeg/ **or** pulled by pinned checksum"). The two `.exe` files are ~175 MB combined,
   which is heavy for a repo targeting free-tier hosting. Currently `.gitignore`d so the choice stays
   open; the source zip's sha256 is already recorded in `library/receipts/binary-ffmpeg.json`.
2. **devDependencies not in the library.** `tsx`, `typescript`, `@types/*` are listed in
   `package.json` but are **not** staged in `library/`, and their versions there are *my* selection,
   not owner-verified — the only unverified versions in the file. They are currently unused (native
   type-stripping covers the script). Either they get staged into the library, or the project commits
   to type-stripping and they come out.
3. **`pnpm install` not yet run.** Deliberate: no lockfile should be generated until (2) is settled,
   or the lockfile will bake in unverified versions.

## 5. Verification

Every claim below is actual command output from this session.

**FFmpeg identity — vendored vs system:**
```
vendor\ffmpeg\ffprobe.exe -version → ffprobe version 7.1.1-essentials_build-www.gyan.dev
vendor\ffmpeg\ffmpeg.exe  -version → ffmpeg  version 7.1.1-essentials_build-www.gyan.dev
system ffmpeg -version             → ffmpeg  version 8.1.2-full_build-www.gyan.dev
  resolved from ...WinGet\Packages\Gyan.FFmpeg.Shared_...\ffmpeg-8.1.2-full_build-shared\bin\ffmpeg.exe
```
Confirms the vendored copy is a genuinely different binary, not a PATH shadow.

**Toolchain:**
```
fnm node v22.23.1   (project)     system node v24.3.0   (untouched)
pnpm 10.30.1                      py -3.11 → Python 3.11.9
```
Note: installed pnpm is **10.30.1** but the library staged `runtime-pnpm` **11.4.0**, and
`package.json` declares `packageManager: pnpm@11.4.0`. Not reconciled this session — flagged for the
next builder, it will matter the moment `pnpm install` runs.

**Pre-flight run** — `node --experimental-strip-types scripts/preflight.ts`, exit code **1**:
```
[a]  ✓ PASS ffprobe is pinned 7.1.1      ✓ PASS ffmpeg is pinned 7.1.1
     ⚠ WARN A different FFmpeg is on PATH: 8.1.2 — never invoke bare `ffmpeg`
[a2] ✓ PASS Node major is 22 — v22.23.1  ✓ PASS py -3.11 resolves — Python 3.11.9
[b]  ○ SKIP Postgres / Redis / S3 reachable — route undecided (0007)
[c]  ✗ FAIL × 8 — every fixture "not built yet" (0009)
[d]  ○ SKIP SAM2 / RIFE / ProPainter — LOCAL_GPU not true, API-only per §17 Q3
-----------------------------------------------------------------
PASS 4   FAIL 8   SKIP 2
PRE-FLIGHT NOT GREEN. Phase 0 exit gate is CLOSED.
```

**Not verified / not done:** no `pnpm install`, no lockfile, no dependency actually installed or
imported. `package.json` is a declaration, not a tested build. No git commit has been made — the
working tree is uncommitted.

## 6. Affected files / components / tests / commits

- All files listed in §4 — created this session
- Test: pre-flight → exit 1, output above. **Correctly red; gate CLOSED.**
- Commits: **none.** `git init` only; nothing staged or committed.
- Blocked by: `VHE-ISSUE-LOG-0009` (fixtures), `VHE-ISSUE-LOG-0007` (services)

## 7. Prevention

**The identity-over-presence principle proved itself and should be reused.** A presence check would
have reported green FFmpeg on a machine whose PATH resolves to a forbidden 8.1.2. Any future gate
that checks a pinned tool should assert the version string, and should also *report the wrong
neighbour it found* — the WARN line naming the 8.1.2 on PATH is the part that would actually save a
confused builder an hour.

**Distinguish SKIP from PASS in gate scripts.** The script deliberately reports undecided services as
SKIP, not PASS, and treats "no failures but skips remain" as still-closed (exit 2). Collapsing
"undecided" into "fine" is how a project convinces itself a gate is met.

**Native type-stripping is a genuinely useful trick on a library-constrained project** — it removed
the need for `tsx`/`typescript` entirely and avoided an unverified download. Harvest candidate for
the Soren Tools Library: Node ≥22.6 can run `.ts` scripts with no build step.

## 8. Related entries

- `VHE-ISSUE-LOG-0005` — the audit whose §7 recommendation this script implements; §4.2 Node route now answered
- `VHE-ISSUE-LOG-0009` — fixtures blocker, the main reason the gate is closed
- `VHE-ISSUE-LOG-0007` — services route, the other reason
- `VHE-ISSUE-LOG-0008` — fixture count enforced by this script
- `VHE-ISSUE-LOG-0006` — the library the pinned versions were sourced from

---

## Appended corrections

**2026-07-19 15:58 EDT — `CC-OPUS-01` — the working tree is now committed. §6 "Commits: none" superseded.**
At the owner's explicit request after this entry was filed, the working tree was committed. §6 above
said "Commits: none" and §5 said "no git commit has been made" — both were true at filing time and
are now superseded, not wrong-as-written (corrections are appended, never edited into the body).

Commit: `8f32b32` on branch `master` (root commit), message "Phase 0 pre-flight scaffold + logging
system". 39 files, 4466 insertions, committed as `elisoren428`. No branch/remote/push — local only.

This does **not** resolve §4 sub-decision 1 (commit-vs-checksum for the vendored binaries): the two
`.exe` files remain `.gitignore`d and excluded from the commit; only `vendor/ffmpeg/LICENSE` was
committed. That decision is still open. Likewise §4 sub-decisions 2 (devDeps) and 3 (no `pnpm
install`, no lockfile) are unchanged — none of that was committed because none of it exists yet.
Git emitted LF→CRLF normalization warnings on the text files (cosmetic on Windows); no
`.gitattributes` was added — flagged as a minor cleanup for the next room.

**2026-07-19 17:26 EDT — `CC-OPUS-01` — §4 sub-decision 1 RESOLVED by owner: checksum-pull, not commit.**
The owner ruled in the 17:19 session: the vendored `.exe` binaries stay **out of git** permanently
(`.gitignore` entry stands) and are verified by **pinned SHA-256** instead. Pins computed this
session from the library staged copy (`library/tools/binary-ffmpeg/ffmpeg-7.1.1-essentials_build/bin/`),
and the vendored copies in `vendor/ffmpeg/` verified byte-identical to them:

- `ffmpeg.exe`  `b90225987bdd042cca09a1efb5e34e9848f2d1dbf5fbcd388753a44145522997`
- `ffprobe.exe` `05e8fa639450f8191635192871ae37a3ec3e4638fa12f3b7d49c6522ba16a8ed`

Provenance chain: `library/receipts/binary-ffmpeg.json` pins the source ZIP
(`04861d33…4a2d4`, self-computed-at-download); the per-`.exe` pins above are first computed here and
are being added to `scripts/preflight.ts` so identity is asserted by hash, not just `-version` string.
§4 sub-decisions 2 (unverified tsx/typescript/@types devDeps) and 3 (pnpm 10.30.1 vs 11.4.0 before
first install) remain OPEN.
