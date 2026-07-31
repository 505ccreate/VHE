/**
 * VHE-2 §3 exit gate (the verifiable core): each available fixture probes to the
 * correct rational fps / frame_count, no_audio has zero audio, and the VFR fixture
 * is detected and conforms to a real CFR master. The full 8-fixture "ingest to
 * ready" gate additionally needs the DB row write + status transition (§4 layer)
 * and the 4 owner-supplied AI fixtures; this file covers everything decidable from
 * the 4 structural fixtures on disk today (owner gate waiver, VHE-ISSUE-LOG-0012).
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ingestProbe, parseRational, probeToFields } from './ingest.ts';
import { probe, runFfprobe } from './ffmpeg.ts';

const FIXTURES = resolve(import.meta.dirname, '..', '..', 'fixtures');

describe('§3 rational fps parsing (§0: never a float)', () => {
  it('parses 30000/1001 as a rational, not 29.97', () => {
    expect(parseRational('30000/1001')).toEqual({ num: 30000, den: 1001 });
  });
  it('rejects a non-rational', () => {
    expect(() => parseRational('29.97')).toThrow();
  });
});

describe('§3 ingest.probe on the structural fixtures', () => {
  it('ntsc_2997.mp4 → fps 30000/1001, 330 frames, not VFR', async () => {
    const f = await ingestProbe(join(FIXTURES, 'ntsc_2997.mp4'));
    expect(f.fields.fps_num).toBe(30000);
    expect(f.fields.fps_den).toBe(1001);
    expect(f.fields.frame_count).toBe(330);
    expect(f.fields.isVfr).toBe(false);
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(f.conformed).toBeUndefined();
  }, 120_000);

  it('long_gop.mp4 → fps 25/1, 300 frames', async () => {
    const f = await ingestProbe(join(FIXTURES, 'long_gop.mp4'));
    expect(f.fields.fps_num).toBe(25);
    expect(f.fields.fps_den).toBe(1);
    expect(f.fields.frame_count).toBe(300);
  }, 120_000);

  it('no_audio.mp4 → zero audio streams', async () => {
    // §3 probe selects v:0; assert audio absence with a full stream list.
    const { stdout } = await runFfprobe([
      '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json',
      join(FIXTURES, 'no_audio.mp4'),
    ]);
    const types = (JSON.parse(stdout).streams ?? []).map((s: any) => s.codec_type);
    expect(types).not.toContain('audio');
    expect(types).toContain('video');
  }, 120_000);

  it('vfr_phone.mp4 → detected VFR, conforms to a real CFR master', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'vhe-s3-conform-'));
    const outPath = join(outDir, 'conformed.mp4');
    try {
      const f = await ingestProbe(join(FIXTURES, 'vfr_phone.mp4'), outPath);
      expect(f.fields.isVfr).toBe(true);
      expect(f.conformed).toBeDefined();
      expect(f.conformed!.relation).toBe('derived');

      // The conformed master must be genuinely CFR: r_frame_rate == avg_frame_rate.
      const cp = await probe(outPath);
      const cf = probeToFields(cp);
      expect(cf.isVfr).toBe(false);
      expect(cf.fps_num).toBe(f.fields.fps_num);
      expect(cf.fps_den).toBe(f.fields.fps_den);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 180_000);
});
