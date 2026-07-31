# VHE-ISSUE-LOG-0013  —  §6 FFmpeg wrapper built; §6.1 verbatim code contradicts its own mandatory golden test (owner-ruled epsilon fix); vitest scoped away from library/

| Field | Value |
|---|---|
| **Log number** | VHE-ISSUE-LOG-0013 |
| **Date / time** | 2026-07-19 evening → 2026-07-20 (session spans midnight EDT) |
| **Logged by** | `CC-FABLE-01` (Claude Fable 5) |
| **Platform / room** | Claude Code — Desktop app, Windows 11 Pro, room "Video Hallucination Editor 7-19-2026" |
| **Blueprint section(s)** | VHE-2 §0 (verbatim rule), §3 (probe cmd), §6 (whole wrapper) |
| **Category** | Blueprint defect / Resolution / Tooling |
| **Status** | **RESOLVED** — §6 wrapper built, both golden tests PASS after an owner-ruled one-line deviation |

---

## 1. What happened

Built the VHE-2 §6 FFmpeg wrapper (`packages/media/ffmpeg.ts`) — the single sanctioned home
for FFmpeg strings in the product — copying every command and code block verbatim from
`VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx` (via the `word/document.xml` extract + the
VHE-ISSUE-LOG-0012 de-autocorrect mapping). Wrote the two mandatory §6 golden tests
(`packages/media/ffmpeg.test.ts`). Three problems surfaced, one of them material:

### (A) MATERIAL — §6.1 verbatim code cannot pass §6.1's own mandatory golden test

§6.1 ships two functions AND the mandatory test that they must satisfy:

- `frameToMs(n)   = round(n*1000*den/num)`            (round to nearest ms)
- `msToFrame(ms)  = floor(ms*num/(1000*den) + 1e-6)`  (floor with tiny epsilon)
- Test: `msToFrame(frameToMs(n)) === n` for all n in 0..10000 at 24/1, 30000/1001, 25/1, 60000/1001.

Run verbatim, the test **FAILS**: round-trip breaks at **n=2 (24/1)**, **n=1 (30000/1001)**,
**n=2 (60000/1001)**; 25/1 passes (frame times are exact ms there). Root cause is a genuine
contradiction in the blueprint, not a transcription error (I re-checked my copy character-for-
character against the XML): `frameToMs` rounds to the nearest ms, injecting up to ±0.5 ms of
error; e.g. frame 2 @24/1 has true time 83.333 ms → rounds to **83** ms → `floor(83*24/1000 +
1e-6) = floor(1.992…) = 1`. The 1e-6 epsilon only defends the exact-boundary case, not the
half-ms quantization the *other* function introduces. §0 rule 4 ("floating-point fps off-by-one
never appears") exists precisely to kill this class of bug, so shipping it XFAIL was wrong.

### (B) minor — the .docx collapsed multi-line code into single paragraphs

Word stored several multi-line code blocks as one paragraph with the newlines gone, so
adjacent lines' text ran together (e.g. §6.3's `"-i", input,"-copyts",` and the trailing
comment merged into the next token; §4.2's worker body is one giant line). Reconstructing the
line boundaries is unavoidable and is **not** a content change — the tokens are verbatim, only
the whitespace the .docx destroyed is restored. Recorded here so a reviewer diffing against the
mirror understands why my file has newlines the mirror doesn't.

### (C) minor — §6.4's concat list used a `printf` that lost its `\n` escapes

`printf "file 'head.mp4'…"` in the .docx has no visible newline separators (same paragraph
collapse). The FFmpeg concat demuxer requires one `file '<path>'` per line, so the wrapper
emits that via a typed `concatListContent(files[])` helper rather than reproducing a broken
printf. Semantics identical; format correct.

## 2. Why it matters

`frameToMs`/`msToFrame` are the core correctness primitive of the entire product — every seek,
every mask keyframe, every repair range, every splice keyframe lookup depends on them being
exact inverses. A silent off-by-one here corrupts edits at 29.97/59.94 fps, which is exactly
the failure §0 and the ntsc_2997 fixture were designed to prevent. This had to be fixed, not
deferred.

## 3. Attempted solutions

- Confirmed the failure was the blueprint's, not mine: re-extracted §6.1 from the XML, compared
  byte-for-byte, reproduced the identical floor/round pair. Failure is deterministic.
- Enumerated the fix options for the owner (epsilon bias / ceil / hold-verbatim-XFAIL) rather
  than choosing a math change to a frozen blueprint unilaterally — a §6 formula change is
  owner-material even under the 0011 delegation.

## 4. Resolution

**OWNER RULING (2026-07-20, in-chat): half-ms epsilon fix.** `msToFrame` becomes:

```
Math.floor(((ms + 0.5) * num) / (1000 * den) + 1e-6)
```

The single adapted line, marked with a `BUILDER DEVIATION` comment citing this entry; the rest
of §6.1 stays verbatim. **Correctness proof:** `frameToMs(n) = n·1000·den/num + e` with the
rounding error `e ∈ [−0.5, +0.5]` ms. Then `(frameToMs(n) + 0.5)·num/(1000·den) = n +
(e+0.5)·num/(1000·den)`. Since `e+0.5 ∈ [0,1]` and `num/(1000·den) ≤ 0.06` for all four target
rates, the added term is in `[0, 0.06] ⊂ [0,1)`, so the floor returns exactly `n`. The +0.5 ms
absorbs `frameToMs`'s round-to-nearest quantization; display/seek semantics are unchanged at
any real fps (the shift is sub-millisecond).

Also built:
- `packages/media/ffmpeg.ts` — §6.1 math, §3 probe command + `probe()` helper, §6.2 true-last-
  frame (fast + exact fallback), §6.3 `extractFrameRangeArgs`, §6.4 keyframe-aware splice
  (keyframe probe, head/tail cut, mid encode, concat, optional-audio remap), §6.5 stitch
  Path A / normalize Path B, §6.6 proxy/filmstrip, §6.7 VFR conform. All commands as typed
  `string[]` arg builders; `runFfmpeg`/`runFfprobe` refuse to run if the vendored 7.1.1 binary
  is absent (never falls back to the forbidden system 8.1.2).
- `vitest.config.ts` — scopes test discovery to `packages/**` + `scripts/**`, excludes
  `library/**`, `vendor/**`, `node_modules/**`. Without it, `vitest run` walked
  `library/tools/` (the 37k-file directory CLAUDE.md forbids scanning) and executed the staged
  packages' own suites (fastify/zod/wavesurfer), which fail on missing peer deps. Tooling
  guard only; no product behavior.
- `package.json` — `pnpm test` → `vitest run`.

## 5. Verification (actually run)

- `vitest run` (fnm Node 22.23.1, vendored ffmpeg 7.1.1): **Test Files 1 passed, Tests 5
  passed.**
  - §6.1 round-trip: PASS at 24/1, 30000/1001, 25/1, 60000/1001 for all n in 0..10000.
  - §6.3 on `fixtures/long_gop.mp4`: extract [137..180] → **exactly 44 files**, first
    `0000137.png`, last `0000180.png`; `0000137.png` **byte-identical (sha256)** to the
    full-decode reference frame 137 produced via the same recipe at A=0. This validates both
    the extraction recipe AND the fixture's mid-GOP seek behavior (keyint=250, range sits
    mid-GOP as VHE-ISSUE-LOG-0011 built it to).
- Pre-fix run captured for the record: 3 failed / 2 passed, breaking at the n values in §1(A).

## 6. Affected files / components / tests / commits

- `packages/media/ffmpeg.ts` (new), `packages/media/ffmpeg.test.ts` (new),
  `vitest.config.ts` (new), `package.json` (`test` script).
- Unblocks: §3 ingest (needs `probe()` + §6.7 conform + §6.6 proxy/filmstrip — all present).
- **NOT yet built (deliberately, tracked):** §6.4's three splice golden tests need the splice
  *orchestration* (which frames are repaired), which is §9-era, not §6. The arg builders exist
  and are unit-testable; the end-to-end splice tests wait for §9. §4.2/§4.3 skeletons are
  transcribed in the mirror but not yet turned into product `.ts` — that is the next section.

## 7. Prevention

- **Blueprint-defect protocol confirmed:** when verbatim code fails its own mandatory test,
  that is an owner-material contradiction — enumerate fixes, get a ruling, apply as a single
  commented `BUILDER DEVIATION` line citing the log entry. Do not silently "fix" frozen code,
  and do not ship it XFAIL.
- **vitest MUST be scoped** in any room that adds a test runner here — the staged `library/`
  packages carry their own test files and the default glob will find them and blow up. The
  `vitest.config.ts` include-list is the guard.
- **Harvest candidate (§6.1 fix):** the half-ms epsilon `msToFrame` is a reusable correctness
  fix for the Soren Tools Library / any future blueprint revision — the original pairing is a
  latent off-by-one generator.

## 8. Related entries

- `VHE-ISSUE-LOG-0012` — the de-autocorrect mapping used to copy §6 verbatim; PG/gate rulings.
- `VHE-ISSUE-LOG-0011` — the 0011 delegation; built `long_gop.mp4` with keyint=250 (the §6.3
  golden-test fixture this entry exercises).
- `VHE-ISSUE-LOG-0005` — system FFmpeg 8.1.2 hazard the wrapper's vendored-only guard defends.
