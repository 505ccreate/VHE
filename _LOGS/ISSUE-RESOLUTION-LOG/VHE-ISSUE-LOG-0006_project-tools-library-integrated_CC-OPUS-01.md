# VHE-ISSUE-LOG-0006  —  Project tools library (`library/`) added by owner and wired into the room docs

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0006 |
| **Date / time** | 2026-07-19 14:20 EDT |
| **Logged by** | `CC-OPUS-01` |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §1 (Pre-Flight staging), VHE-3 (tools checklist) |
| **Category** | Discovery / Integration |
| **Status** | **RESOLVED** — audited and wired into the entry-point docs |

---

## 1. What happened

The owner staged a project-local tools library at `library/` (copied 2026-07-19 from the central
**Soren Tools Library** at `C:\Users\user\Documents\Soren-Tools-Library-V1 - TRANSFER 2026-07-17`)
and asked that it be reviewed and made discoverable to every future room.

### What it contains (audited)

- **52 tool bundles** under `library/tools/`, ~904 MB, 37,157 files, staged under the **API-only
  profile** — matching the owner's Q3 decision before it was even formally recorded.
- **`library/receipts/`** — one verified acquisition receipt per bundle: source URL, exact version,
  SHA-256 (with provenance), and a verification statement. Spot-checked receipts all coherent.
- **`library/manifest.json`** — machine-readable inventory with copy verification.
- **`library/COPY-LOG.md`** — staging result: 52/52 bundles reverified, byte-exact against the
  central library's verified intake.
- **`library/_stage-project-library.ps1`** — reproducible append-only staging script.

Coverage vs the VHE-3 checklist: runtimes (Node 22.23.1 MSI, pnpm 11.4.0, Python 3.11.15 src),
services (Postgres 16.14 src, Valkey 9.1.0 src as the Redis-compatible service), FFmpeg 7.1.1 +
ffprobe Windows build, all Node backend deps (fastify, bullmq, ioredis, pg, drizzle, zod, s3,
sharp, ws, undici, ulid), frontend deps (react, next, zustand, konva/react-konva, 11 Radix
primitives, framer-motion, wavesurfer, comlink, mp4box), Python utilities (opencv-headless 5.0.0.93
wheel, fastapi, redis client, scenedetect), QA (Playwright 1.61.1, vitest), 3 font bundles, and the
five hosted-API SDKs: **fal.ai, Replicate, OpenAI, Google Gen AI, ElevenLabs**.

**Excluded by policy** (per COPY-LOG): local AI engines, model weights, GPU alternatives, MinIO
(unresolved), credentials, test fixtures.

### Library policy (from its README — binding on all rooms)

1. Artifacts are **copied acquisitions, not installations**. Nothing in `library/` is installed,
   imported, executed, or on PATH until pre-flight deliberately wires it in.
2. AI capabilities use hosted APIs only; no model weights ever enter this library.
3. **API credentials never belong in this folder, git, or backups.** The owner maintains a separate
   central API-key library and will grant rooms access when needed — keys are never copied into
   this project.

## 2. Why it matters

Before this, "stage the VHE-3 checklist" meant every room independently downloading and verifying
~40 dependencies. Now pre-flight staging is mostly **copy-from-library with checksums already
verified** — faster, deterministic, and identical across rooms. Rooms that don't know it exists
will waste tokens re-downloading what's already on disk; hence this entry and the CLAUDE.md wiring.

## 3. Attempted solutions

1. **Attempt:** Recursive file listing of `library/`. **Result:** timed out — 37k files. Lesson
   for future rooms: **never recursively scan `library/tools/`**; read `manifest.json`,
   `COPY-LOG.md`, and individual receipts instead.
2. **Attempt:** Shallow listing + README + COPY-LOG + manifest keys + 8 key receipts.
   **Result:** full picture obtained; findings above.

## 4. Resolution

Wired into the room entry points so every future builder discovers it in the first minute:

- `CLAUDE.md` — new "Tools library" section: what it is, the don't-scan rule, the not-installed
  rule, and the fixtures/MinIO gaps.
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — library noted as the pre-flight staging source.
- This entry is the deep reference; the handoff points here.

**Gaps a pre-flight builder must know:** (a) three source-tarball bundles are not Windows-usable —
alternatives in `VHE-ISSUE-LOG-0005` §4; (b) **test fixtures are excluded** — the seven VHE-2 §1
fixtures must still be built by hand in week 1; (c) MinIO is unresolved pending the hosting
decision (`VHE-ISSUE-LOG-0007`).

## 5. Verification

README, COPY-LOG, manifest top-level keys, and 8 receipts read directly; bundle count (52)
confirmed by directory count; tool names enumerated. Checksums were **not** independently
re-verified this session — the library's own verification chain (central intake → staging
reverification) is documented in COPY-LOG.md and treated as authoritative. No file in `library/`
was modified.

## 6. Affected files / components / tests / commits

- `library/` — audited, **unmodified**
- `CLAUDE.md` — modified (Tools library section added)
- `_LOGS/STATUS-HANDOFF/CURRENT-STATUS.md` — updated

## 7. Prevention

The staging script and receipt/manifest pattern is itself the prevention — provenance is checkable
without network access. Future rooms: consult `manifest.json` first, receipts second, and never
glob the tools tree.

## 8. Related entries

- `VHE-ISSUE-LOG-0005` — which bundles are not Windows-usable and what to use instead
- `VHE-ISSUE-LOG-0007` — hosting decision affecting MinIO/Postgres/Redis routes

---

## Appended corrections

_(none)_
