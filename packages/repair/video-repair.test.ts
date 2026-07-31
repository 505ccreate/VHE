/**
 * VHE-2 §9.2A — deterministic video-repair core, mock-driven (no key, no GPU, no real fixtures).
 *
 * Covers the six deterministic pieces (Eli Q1): padded range extraction, keyframe/interp math,
 * absolute↔local translation, the §9.2 mask-only composite (non-destructive), provider-output
 * contract validation, and preview-window assembly. This validates PLUMBING only — repair QUALITY
 * stays unproven until the real §1 fixtures run (owner's gate; VHE-ISSUE-LOG-0024).
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { PixelBox } from './inpaint.ts';
import {
  DEFAULT_TEMPORAL_PAD,
  DEFAULT_KEYFRAME_STRIDE,
  paddedExtractionRange,
  extractionArgsForRepair,
  keyframeSet,
  bracketingKeyframes,
  interpolationT,
  localToAbsolute,
  absoluteToLocal,
  keyframesInRange,
  compositeRangeUnderMask,
  validateKeyframePatchOutputs,
  previewWindowEncodeArgs,
  type FramePatch,
} from './video-repair.ts';

// ── 1. Padded range extraction ─────────────────────────────────────────────────────────────────

describe('§9.2A paddedExtractionRange', () => {
  it('pads by 4 frames each side by default (§9.2 [a−4 .. b+4])', () => {
    expect(paddedExtractionRange({ a: 100, b: 120 })).toEqual({ start: 96, end: 124, pad: DEFAULT_TEMPORAL_PAD });
  });

  it('clamps the start at frame 0', () => {
    expect(paddedExtractionRange({ a: 2, b: 10 })).toEqual({ start: 0, end: 14, pad: 4 });
  });

  it('clamps the end to the clip last frame when provided', () => {
    expect(paddedExtractionRange({ a: 100, b: 120 }, { lastFrame: 122 })).toEqual({ start: 96, end: 122, pad: 4 });
  });

  it('honors a custom pad and rejects bad input', () => {
    expect(paddedExtractionRange({ a: 50, b: 60 }, { pad: 0 })).toEqual({ start: 50, end: 60, pad: 0 });
    expect(() => paddedExtractionRange({ a: 10, b: 5 })).toThrow(/before start/);
    expect(() => paddedExtractionRange({ a: -1, b: 5 })).toThrow(/≥ 0/);
    expect(() => paddedExtractionRange({ a: 1.5, b: 5 })).toThrow(/integer/);
    expect(() => paddedExtractionRange({ a: 0, b: 5 }, { pad: -1 })).toThrow(/non-negative/);
  });
});

describe('§9.2A extractionArgsForRepair', () => {
  it('builds §6.3 extraction args over the padded window at rational fps', () => {
    const { args, padded } = extractionArgsForRepair('in.mp4', { a: 137, b: 180 }, 30000, 1001, '/out');
    expect(padded).toEqual({ start: 133, end: 184, pad: 4 });
    // §6.3 numbers frames by absolute index → -start_number is the padded start
    const si = args.indexOf('-start_number');
    expect(args[si + 1]).toBe('133');
    expect(args[args.length - 1]).toBe('/out/%07d.png');
    expect(args).toContain('-copyts'); // the §6.3 timestamp-trim method
  });
});

// ── 2. Keyframe / interpolation math ─────────────────────────────────────────────────────────────

describe('§9.2A keyframeSet', () => {
  it('is a, a+s, …, b with b forced in (default stride 4)', () => {
    expect(keyframeSet(10, 22)).toEqual([10, 14, 18, 22]); // 22 lands on stride
    expect(keyframeSet(10, 20)).toEqual([10, 14, 18, 20]); // 20 forced (not on stride)
    expect(DEFAULT_KEYFRAME_STRIDE).toBe(4);
  });

  it('handles a single-frame range', () => {
    expect(keyframeSet(7, 7)).toEqual([7]);
  });

  it('accepts strides 4–6 and rejects others (§9.2 "s = 4–6")', () => {
    expect(keyframeSet(0, 12, 6)).toEqual([0, 6, 12]);
    expect(keyframeSet(0, 13, 5)).toEqual([0, 5, 10, 13]);
    expect(() => keyframeSet(0, 12, 3)).toThrow(/\[4\.\.6\]/);
    expect(() => keyframeSet(0, 12, 7)).toThrow(/\[4\.\.6\]/);
  });

  it('never duplicates b when it already lands on a stride', () => {
    const keys = keyframeSet(0, 8, 4);
    expect(keys).toEqual([0, 4, 8]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('§9.2A bracketingKeyframes + interpolationT', () => {
  const keys = keyframeSet(10, 22); // [10,14,18,22]

  it('finds the bracketing pair for a non-key frame', () => {
    expect(bracketingKeyframes(12, keys)).toEqual({ k1: 10, k2: 14 });
    expect(bracketingKeyframes(20, keys)).toEqual({ k1: 18, k2: 22 });
  });

  it('returns null for a key frame or out-of-span frame', () => {
    expect(bracketingKeyframes(14, keys)).toBeNull(); // is a key
    expect(bracketingKeyframes(9, keys)).toBeNull(); // before span
    expect(bracketingKeyframes(23, keys)).toBeNull(); // after span
  });

  it('computes the §9.2 RIFE blend t = (f−k1)/(k2−k1)', () => {
    expect(interpolationT(12, 10, 14)).toBeCloseTo(0.5, 10);
    expect(interpolationT(11, 10, 14)).toBeCloseTo(0.25, 10);
    expect(() => interpolationT(10, 10, 14)).toThrow(/k1 < f < k2/);
    expect(() => interpolationT(5, 10, 10)).toThrow(/k1 < k2/);
  });
});

// ── 3. Absolute ↔ local translation ──────────────────────────────────────────────────────────────

describe('§9.2A absolute ↔ local index translation (§8)', () => {
  it('round-trips absolute = rangeStart + local', () => {
    const rangeStart = 133;
    for (const local of [0, 1, 47]) {
      expect(absoluteToLocal(localToAbsolute(local, rangeStart), rangeStart)).toBe(local);
    }
    expect(localToAbsolute(4, 133)).toBe(137);
    expect(absoluteToLocal(137, 133)).toBe(4);
  });

  it('selects the keys inside an extracted window', () => {
    const keys = keyframeSet(100, 140); // [100,104,...,140]
    expect(keyframesInRange(keys, 104, 120)).toEqual([104, 108, 112, 116, 120]);
    expect(keyframesInRange(keys, 141, 200)).toEqual([]);
  });
});

// ── 4. Mask-only compositing (§9.2 rule; non-destructive) ────────────────────────────────────────

const RED = { r: 220, g: 30, b: 30 };
const GREEN = { r: 0, g: 200, b: 0 };
function solid(w: number, h: number, c: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
}
async function rgbAt(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const r = await sharp(png).removeAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return [r[0]!, r[1]!, r[2]!];
}

describe('§9.2A compositeRangeUnderMask', () => {
  const box: PixelBox = { x: 16, y: 16, w: 32, h: 32 };

  async function makePatch(frame: number): Promise<FramePatch> {
    // mask crop: white (edit) center 16×16 inside the 32×32 box; black (keep) border.
    const maskCrop = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: await solid(16, 16, { r: 255, g: 255, b: 255 }), left: 8, top: 8 }])
      .png().toBuffer();
    return { frame, patch: await solid(32, 32, GREEN), box, maskCrop };
  }

  it('applies the §9.2 rule inside the mask and leaves everything else byte-untouched', async () => {
    const original = await solid(64, 64, RED);
    const frames = new Map<number, Buffer>([[10, original], [11, await solid(64, 64, RED)]]);
    const out = await compositeRangeUnderMask(frames, [await makePatch(10)]);

    // frame 10 was patched: center of the mask (32,32) is now green-dominant…
    const [r, g] = await rgbAt(out.get(10)!, 32, 32);
    expect(g).toBeGreaterThan(120);
    expect(g).toBeGreaterThan(r);
    // …inside the box but OUTSIDE the mask (18,18) stays red (kept)…
    expect((await rgbAt(out.get(10)!, 18, 18))[0]).toBeGreaterThan(150);
    // …and OUTSIDE the box (2,2) stays red (untouched).
    expect((await rgbAt(out.get(10)!, 2, 2))[0]).toBeGreaterThan(150);

    // frame 11 had no patch → passes through as the identical original buffer (non-destructive).
    expect(out.get(11)).toBe(frames.get(11));
  });

  it('throws when a patch references a frame that was not extracted', async () => {
    const frames = new Map<number, Buffer>([[10, await solid(64, 64, RED)]]);
    await expect(compositeRangeUnderMask(frames, [await makePatch(99)])).rejects.toThrow(/no extracted frame 99/);
  });
});

// ── 5. Provider-output contract validation ───────────────────────────────────────────────────────

describe('§9.2A validateKeyframePatchOutputs', () => {
  const keys = keyframeSet(0, 8, 4); // 3 keys: [0,4,8]
  const imgOut = (n: number) => Array.from({ length: n }, () => ({ kind: 'bytes' as const, bytes: Buffer.from('x'), mimeType: 'image/png' }));

  it('accepts exactly one image patch per keyframe', () => {
    expect(validateKeyframePatchOutputs(keys, imgOut(3))).toHaveLength(3);
  });

  it('rejects the wrong patch count', () => {
    expect(() => validateKeyframePatchOutputs(keys, imgOut(2))).toThrow(/expected at least 3|expected exactly 3/);
    expect(() => validateKeyframePatchOutputs(keys, imgOut(4))).toThrow(/expected exactly 3/);
  });

  it('rejects a non-image output', () => {
    expect(() => validateKeyframePatchOutputs(keys, [
      { kind: 'bytes', bytes: Buffer.from('x'), mimeType: 'image/png' },
      { kind: 'bytes', bytes: Buffer.from('x'), mimeType: 'image/png' },
      { kind: 'bytes', bytes: Buffer.from('x'), mimeType: 'video/mp4' },
    ])).toThrow(/not 'image\/\*'/);
  });
});

// ── 6. Preview-window assembly ───────────────────────────────────────────────────────────────────

describe('§9.2A previewWindowEncodeArgs', () => {
  it('encodes ONLY the padded window, numbered by absolute frame (§9.2 preview)', () => {
    const padded = paddedExtractionRange({ a: 137, b: 180 }); // start 133
    const args = previewWindowEncodeArgs('/mid/%07d.png', padded, 30000, 1001, '/out/preview.mp4');
    const si = args.indexOf('-start_number');
    expect(args[si + 1]).toBe('133'); // preview begins at the padded window's first absolute frame
    expect(args).toContain('-framerate');
    expect(args[args.indexOf('-framerate') + 1]).toBe('30000/1001'); // rational fps, never a float
    expect(args[args.length - 1]).toBe('/out/preview.mp4');
  });
});
