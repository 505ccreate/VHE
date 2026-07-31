/**
 * VHE-2 §6 golden tests.
 *
 * §6.1 (mandatory): msToFrame(frameToMs(n)) === n for every n in 0..10000 at
 *   24/1, 30000/1001, 25/1, 60000/1001.
 * §6.3: on fixtures/long_gop.mp4 extract [137..180] → exactly 44 files, and
 *   0000137.png pixel-identical to full-decode frame 137. The full-decode
 *   reference is produced through the wrapper's own recipe with A=0 (seek 0 ⇒
 *   a genuine full decode), once per test run. "Pixel-identical" is asserted
 *   as byte-identical PNGs — same encoder, same settings, strictest form.
 *
 * §6.4's golden tests need the splice orchestration (§9-era); tracked in
 * VHE-ISSUE-LOG-0013 as not-yet-written, deliberately.
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { extractFrameRangeArgs, frameToMs, msToFrame, probe, runFfmpeg } from './ffmpeg.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const LONG_GOP = join(REPO_ROOT, 'fixtures', 'long_gop.mp4');

describe('§6.1 frame ↔ time math golden test (mandatory)', () => {
  const rates: Array<[number, number]> = [[24, 1], [30000, 1001], [25, 1], [60000, 1001]];

  for (const [num, den] of rates) {
    it(`msToFrame(frameToMs(n)) === n for n in 0..10000 at ${num}/${den}`, () => {
      for (let n = 0; n <= 10000; n++) {
        if (msToFrame(frameToMs(n, num, den), num, den) !== n) {
          // Loop kept manual so a failure reports the exact n without 40k assertions.
          expect.fail(`round-trip broke at n=${n} for ${num}/${den}`);
        }
      }
      expect(msToFrame(frameToMs(10000, num, den), num, den)).toBe(10000);
    });
  }
});

// The round-trip above only exercises ms values that frameToMs itself produces. Ruling 3
// of VHE-ISSUE-LOG-0018 requires the §6.1 half-ms deviation to be covered for ARBITRARY
// integer-ms seeks at the two drop-frame rates — i.e. what happens when a user seeks to an
// ms that is not on a frame boundary. Sweep every integer ms and assert the invariants a
// correct seek must have: msToFrame is monotonic non-decreasing, never skips a frame (frame
// duration at both rates is > 1 ms, so consecutive ms differ by at most one frame), and each
// frame's first ms lands within ±1 ms of frameToMs(frame) — the boundary the +0.5 ms epsilon
// exists to keep aligned.
describe('§6.1 arbitrary integer-ms seek boundaries (VHE-ISSUE-LOG-0018, Ruling 3)', () => {
  const rates: Array<[number, number]> = [[30000, 1001], [60000, 1001]];
  const MAX_MS = 300_000; // 5 minutes of seek targets

  for (const [num, den] of rates) {
    it(`msToFrame is monotonic, skip-free, and boundary-aligned for every ms 0..${MAX_MS} at ${num}/${den}`, () => {
      expect(msToFrame(0, num, den)).toBe(0);
      let prev = 0;
      for (let ms = 1; ms <= MAX_MS; ms++) {
        const f = msToFrame(ms, num, den);
        if (f < prev) expect.fail(`non-monotonic at ms=${ms} (${num}/${den}): ${prev} -> ${f}`);
        if (f - prev > 1) expect.fail(`frame skipped at ms=${ms} (${num}/${den}): ${prev} -> ${f}`);
        if (f === prev + 1) {
          // ms is the first integer that maps to frame f — the seek boundary for f.
          const expected = frameToMs(f, num, den);
          if (Math.abs(ms - expected) > 1) {
            expect.fail(
              `seek boundary misaligned at frame ${f} (${num}/${den}): first ms ${ms} vs frameToMs ${expected}`,
            );
          }
        }
        prev = f;
      }
    });
  }
});

describe('§6.3 exact frame-range extraction golden test (long_gop.mp4)', () => {
  it('extract [137..180] → exactly 44 files; 0000137.png pixel-identical to full-decode frame 137', async () => {
    const fpsNum = 25;
    const fpsDen = 1;
    const pr = await probe(LONG_GOP);
    expect(pr.streams[0].r_frame_rate).toBe(`${fpsNum}/${fpsDen}`);
    const nFrames = Number(pr.streams[0].nb_read_frames);
    expect(nFrames).toBe(300);

    const rangeDir = mkdtempSync(join(tmpdir(), 'vhe-63-range-'));
    const refDir = mkdtempSync(join(tmpdir(), 'vhe-63-ref-'));
    try {
      // Range extraction under test.
      await runFfmpeg(extractFrameRangeArgs(LONG_GOP, 137, 180, fpsNum, fpsDen, rangeDir.replaceAll('\\', '/')));
      const got = readdirSync(rangeDir).sort();
      expect(got.length).toBe(44);
      expect(got[0]).toBe('0000137.png');
      expect(got[43]).toBe('0000180.png');

      // Full-decode reference via the same recipe at A=0 (seekS=0 ⇒ full decode).
      await runFfmpeg(extractFrameRangeArgs(LONG_GOP, 0, nFrames - 1, fpsNum, fpsDen, refDir.replaceAll('\\', '/')));
      expect(readdirSync(refDir).length).toBe(300);

      const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
      expect(sha(join(rangeDir, '0000137.png'))).toBe(sha(join(refDir, '0000137.png')));
    } finally {
      rmSync(rangeDir, { recursive: true, force: true });
      rmSync(refDir, { recursive: true, force: true });
    }
  }, 300_000);
});
