# VHE-ISSUE-LOG-0005  —  Hardware & environment compatibility audit vs blueprint requirements

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0005 |
| **Date / time** | 2026-07-19 14:15 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §1 (Pre-Flight), VHE-3 (entire) |
| **Category** | Discovery / Compatibility |
| **Status** | **PARTIALLY RESOLVED** — audit complete, alternatives identified; installs still pending |

---

## 1. What happened

Owner requested a compatibility check of this development machine against what the blueprints
require. Full audit run 2026-07-19 ~14:00–14:16 EDT.

### Machine

| Component | Actual | Blueprint requirement | Verdict |
|---|---|---|---|
| CPU | Intel i5-8250U, 4 cores / 8 threads @ 1.6 GHz | none stated | OK for dev; heavy local encodes will be slow |
| RAM | 15.9 GB | none stated | OK for dev |
| GPU | **Intel UHD 620 integrated, ~1 GB, no CUDA** | 24 GB-class CUDA GPU *only if* local-GPU path chosen | **Local GPU path impossible on this machine** |
| Disk | 67.3 GB free | tens of GB of model weights if local-GPU | Fine for API-only; would NOT have fit local weights comfortably |
| OS | Windows 11 Pro | not stated (tooling is POSIX-leaning) | OK with caveats below |

**The GPU finding upgrades the owner's API-only decision (see `VHE-ISSUE-LOG-0003` appended
corrections) from "chosen" to "mandatory on this machine."** There is no CUDA hardware here at all.

### Toolchain present / missing

| Tool | Found | Blueprint pin | Verdict |
|---|---|---|---|
| Node | **v24.3.0** at `C:\Program Files\nodejs\` | **Node 22 LTS** | ⚠️ Version mismatch — see §4.2 |
| pnpm | present | pnpm | ✅ |
| git | 2.49.0 | not stated (needed) | ✅ (project is not yet a repo) |
| Python | 3.13.5 (3.11 winget install started this session) | **Python 3.11** | ⚠️ In progress — see §4.1 |
| FFmpeg | **system 8.1.2 full-shared on PATH** (winget/Gyan) | **pinned 7.x vendored in repo — "Never use system ffmpeg"** | 🚨 Hazard — see §4.3 |
| Postgres (`psql`) | NOT FOUND | Postgres 16 | Missing — see §4.4 |
| Redis | NOT FOUND | Redis 7 | Missing — see §4.5 |
| Docker | NOT FOUND | (one route to Redis/Postgres) | absent |
| WSL | `wsl.exe` present (distro state not verified) | — | possible service host |
| MinIO | NOT FOUND | MinIO (dev S3) | Missing — see §4.6 |

### Library bundles that are not Windows-usable as shipped

Three bundles in `library/tools/` are **source tarballs** requiring compilation, which is not
practical on Windows:

- `runtime-python` — Python-3.11.15.tar.xz (source)
- `service-postgres` — postgresql-16.14.tar.bz2 (source)
- `service-redis` — Valkey 9.1.0 tar.gz (source; Valkey ships no native Windows binaries at all)

The rest of the library is Windows-appropriate (Node MSI, pnpm win32 zip, FFmpeg 7.1.1 Windows
build, win_amd64 wheels, npm tarballs which are platform-neutral).

## 2. Why it matters

A builder starting VHE-2 §1 pre-flight from the library alone would hit three un-installable
bundles and either stall or improvise. The system-FFmpeg hazard is worse: a builder testing
commands casually will silently get FFmpeg **8.1.2** semantics while production uses the pinned
**7.1.1** — exactly the class of environment drift VHE-2 §1 pins versions to prevent.

## 3. Attempted solutions

1. **Attempt:** Hardware inventory via CIM (`Win32_Processor`, `Win32_ComputerSystem`,
   `Win32_VideoController`, drive stats). **Result:** table above; verified output.
2. **Attempt:** Toolchain probe via `Get-Command` for node/pnpm/npm/git/docker/ffmpeg/psql/
   redis-server/wsl + version checks. **Result:** table above; verified output.
3. **Attempt:** Receipt inspection for the version-critical library bundles.
   **Result:** identified the three source-tarball bundles; all receipts otherwise verified.

## 4. Resolution — alternatives for each incompatibility

Per owner instruction: build locally, host on free tiers (Vercel / Firebase / Supabase — see
`VHE-ISSUE-LOG-0007`). Alternatives chosen with that in mind:

1. **Python 3.11 (source tarball unusable):** install the official Windows build via
   `winget install Python.Python.3.11` — side-by-side with 3.13, uses `py -3.11` launcher.
   **Started this session (owner-approved); completion recorded in Appended corrections below.**
2. **Node 24 vs pinned 22 LTS:** do **not** replace system Node 24 blindly — other projects may
   depend on it. Recommended: a version manager (`nvm-windows`, Volta, or fnm) with the project
   pinned to 22; the library's `runtime-node` 22.23.1 MSI is available if the owner prefers a
   direct install. **Deferred to pre-flight; owner/builder choice.**
3. **System FFmpeg 8.1.2 hazard:** never invoke bare `ffmpeg` in this project. At pre-flight,
   extract the library's `binary-ffmpeg` 7.1.1 into `/vendor/ffmpeg/` per VHE-2 §1 and make the §6
   wrapper reference that absolute path only. `scripts/preflight.ts` must assert the ffprobe it
   finds is the pinned 7.1.1, not 8.1.2. Note: the library build is Gyan *essentials*; if a §6
   recipe ever needs a filter missing from essentials, swap to the *full* 7.1.1 build — log it if so.
4. **Postgres 16 (source tarball unusable):** two viable routes —
   (a) **Supabase-hosted Postgres for dev too** (free tier, aligns with the owner's hosting
   direction; zero local install), or (b) EDB Windows installer for Postgres 16 locally.
   **Open — folded into `VHE-ISSUE-LOG-0007`.**
5. **Redis 7 (Valkey source unusable; no native Windows Redis):** options — WSL2 (present on
   machine), Docker Desktop (not installed), Memurai (native Windows, Redis-compatible), or a
   hosted free tier (e.g. Upstash). Choice interacts with the hosting decision.
   **Open — folded into `VHE-ISSUE-LOG-0007`.**
6. **MinIO:** dev-time S3. If Supabase is adopted, Supabase Storage is S3-compatible and may cover
   both dev and prod. **Open — folded into `VHE-ISSUE-LOG-0007`.**

## 5. Verification

Hardware and toolchain findings verified by direct command output this session. The Python 3.11
install was **launched but not yet verified** at time of writing — its outcome is recorded in the
Appended corrections, not assumed here. No other install was performed.

## 6. Affected files / components / tests / commits

- No project files modified by the audit itself
- Blocks/informs: VHE-2 §1 pre-flight, `scripts/preflight.ts` design (must assert vendored FFmpeg)
- `library/tools/{runtime-python, service-postgres, service-redis}` — flagged, not modified

## 7. Prevention

`scripts/preflight.ts` should verify **identity, not just presence**: pinned FFmpeg version at the
vendored path, `py -3.11` resolvable, Node major = 22 for the project. Presence-only checks would
have passed on this machine while three of the four pins were wrong.

## 8. Related entries

- `VHE-ISSUE-LOG-0003` — owner decisions this audit validates (API-only now proven mandatory)
- `VHE-ISSUE-LOG-0006` — the tools library these bundles live in
- `VHE-ISSUE-LOG-0007` — hosting decision that resolves the Postgres/Redis/MinIO route

---

## Appended corrections

**2026-07-19 14:35 EDT — `CC-OPUS-01` — Python 3.11 install completed and verified.**
`winget install Python.Python.3.11` exited 0. Verified: `py -3.11 --version` → `Python 3.11.9`,
side-by-side with 3.13 (and a 3.15 that is the machine default — workers must always invoke
`py -3.11`, never bare `python`). Version note: winget delivers **3.11.9**, the last 3.11 release
python.org shipped as a Windows binary installer; the library receipt's 3.11.15 is a source-only
release of the same maintenance line. 3.11.9 satisfies the blueprint's "Python 3.11" pin. §4.1 is
now closed; §4.2–§4.6 remain as stated.

**2026-07-19 15:12 EDT — `CC-OPUS-01` — §4.2 ANSWERED by the owner: version-manager route. §4.3 CLOSED.**

*§4.2 (Node 22 vs 24) — resolved.* The owner chose the version manager over the library MSI, keeping
system Node 24.3.0 untouched for other projects. Executed: `winget install --id Schniz.fnm` → fnm
1.39.0; `fnm install 22` → **Node v22.23.1**; project pinned via `.node-version`. Verified:
fnm node → `v22.23.1`, system node → `v24.3.0` (unchanged). Worth noting for the record — fnm
resolved 22 LTS to **22.23.1, byte-identical in version to the library's `runtime-node` 22.23.1
bundle**, so the two routes converge on the same build and the choice cost nothing in fidelity.
Practical gotcha: winget's PATH edit does not reach an already-running shell, so `fnm` had to be
invoked by absolute path this session; a fresh shell picks it up normally.

*§4.3 (system FFmpeg 8.1.2 hazard) — mitigated and now machine-enforced.* Vendored the library's
7.1.1 build to `vendor/ffmpeg/` and implemented the §7 recommendation in `scripts/preflight.ts`: it
asserts the ffprobe/ffmpeg at the vendored path report `7.1.1` and hard-fails otherwise, and it
additionally emits a WARN naming any different FFmpeg found on PATH. Verified on this machine —
vendored reports 7.1.1, PATH reports 8.1.2, both printed. The hazard is no longer silent.

*§4.4–§4.6 (Postgres / Redis / MinIO) remain open* — still folded into `VHE-ISSUE-LOG-0007`.
Full scaffold record: `VHE-ISSUE-LOG-0010`.
