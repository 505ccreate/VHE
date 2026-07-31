# VHE-ISSUE-LOG-0014  —  §3 ingest/probe correctness core built and verified on the structural fixtures

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0014 |
| **Date / time** | 2026-07-20 (EDT, post-midnight) |
| **Logged by** | `CC-FABLE-01` (Claude Fable 5) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §0, §3, §6.7 (conform) |
| **Category** | Resolution / Build |
| **Status** | **RESOLVED** for the decidable core — full 8-fixture "ingest to ready" gate awaits §4 DB layer + owner AI fixtures (noted below) |

---

## 1. What happened

Built the VHE-2 §3 ingest & probe correctness core in `packages/media/ingest.ts` and tested it
against the four structural fixtures on disk. §3 is the "build FIRST" section — every asset
must pass `ingest.probe` before it becomes `ready`, and all downstream frame math depends on
the rational fps fields this produces.

Scope decision: §3's full flow also writes the `media_assets` row, transitions status to
`ready`, and enqueues §6.6 proxy/filmstrip — but those are the §4 job-lifecycle / API layers
(DB row insert, BullMQ). I built the **pure correctness core** — probe → rational fields →
sha256 → VFR-detect → §6.7 conform — decoupled from DB/queue, because that is (a) the part §3's
exit gate actually verifies ("correct fps_num/fps_den/frame_count; VFR fixture produces a
conformed derived master") and (b) independently testable now. The §4 worker will call
`ingestProbe()`, persist `fields`, record the conform lineage edge, and enqueue proxy/filmstrip.
This split is intentional and is not scope-cutting — it is the natural §3/§4 boundary.

## 2. Why it matters

The rational-fps parse is §0 rule 4 in code form: `parseRational` returns `{num, den}` and
never a float, and it throws on a non-rational input — so a `29.97` can never silently enter the
system. VFR detection compares r_frame_rate vs avg_frame_rate as **rational values, not
strings** (so `30/1` == `30000/1000`), and a VFR source is conformed to CFR before any editing,
exactly as §3 requires ("All frame math in this product assumes CFR").

## 3. Attempted solutions

- First test run failed on `probe is not a function`: the test imported `probe` from
  `./ingest.ts`, which does not re-export it. Fixed the import to take `probe` from
  `./ffmpeg.ts` (its actual home). Not a product bug — a test-file import error.

## 4. Resolution

`packages/media/ingest.ts` exports:
- `parseRational(s)` → `{num, den}`; throws on non-rational or zero denominator.
- `probeToFields(probeJson)` → pure map of a §3 ffprobe payload to `media_assets` columns
  (codec, width, height, pix_fmt, fps_num/den, frame_count, duration_ms, size_bytes) + `isVfr`.
- `sha256File(path)` → **streamed** sha256 (never buffers the whole asset).
- `ingestProbe(input, conformOutPath?)` → probe + fields + sha256, and when VFR **and** a
  conform path is given, runs §6.7 `conformArgs` via the §6 wrapper and returns the derived
  master with `relation: 'derived'`.

All ffprobe/ffmpeg access is through the §6 wrapper — no command strings composed in this file.

## 5. Verification (actually run — `vitest run`, fnm Node 22.23.1, vendored ffmpeg 7.1.1)

**Test Files 2 passed, Tests 11 passed** (5 §6 golden + 6 §3). The §3 assertions, on the real
fixtures:
- `parseRational('30000/1001')` → `{num:30000, den:1001}`; `parseRational('29.97')` throws.
- `ntsc_2997.mp4` → fps **30000/1001**, frame_count **330**, isVfr **false**, sha256 is 64 hex,
  no conform emitted.
- `long_gop.mp4` → fps **25/1**, frame_count **300**.
- `no_audio.mp4` → stream list contains `video`, **not** `audio` (zero audio streams).
- `vfr_phone.mp4` → isVfr **true**, conform emitted with `relation:'derived'`; the conformed
  master re-probes to **isVfr false** at the same rational fps — a genuinely CFR derived master,
  which is precisely the §3 exit-gate clause for the VFR fixture.

## 6. Affected files / components / tests / commits

- `packages/media/ingest.ts` (new), `packages/media/ingest.test.ts` (new).
- Depends on: `packages/media/ffmpeg.ts` §3 probe cmd, §6.7 conform (VHE-ISSUE-LOG-0013).
- **Deferred to §4 (tracked, not forgotten):** DB `media_assets` row write + `status='ready'`
  transition, lineage edge persistence for the conform, and §6.6 proxy/filmstrip enqueue. The
  full "all fixtures ingest to ready" gate also needs the 4 owner AI fixtures (still undelivered,
  VHE-ISSUE-LOG-0012 waiver in force).

## 7. Prevention

- The rational-only `parseRational` (throws on floats) is the enforcement point for §0 rule 4 —
  any future ingest path should route through it rather than re-parsing r_frame_rate ad hoc.
- VFR comparison must be value-based, not string-based; recorded so a future builder doesn't
  "simplify" it back to `a === b` and reintroduce false negatives on equivalent rationals.

## 8. Related entries

- `VHE-ISSUE-LOG-0013` — the §6 wrapper this consumes (probe, conform); §6.1 epsilon fix.
- `VHE-ISSUE-LOG-0011` — built the structural fixtures (vfr_phone's deliberate VFR jitter is
  what this entry's conform test exercises).
- `VHE-ISSUE-LOG-0012` — gate waiver under which this build proceeds ahead of the AI fixtures.
