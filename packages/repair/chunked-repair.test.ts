/** VHE-2 §9.5 deterministic windowing, resume, overlap, quality, and memory tests. */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  DEFAULT_OVERLAP_FRAMES,
  DEFAULT_WINDOW_FRAMES,
  REPAIR_MEMORY_CEILING_ENV,
  blendOverlapFrameUnderMask,
  executeChunkedRepairPlan,
  firstNonSucceededWindow,
  maskedOverlapSsim,
  nativeWindowBytes,
  overlapBlendT,
  overlapRange,
  planChunkedRepair,
  repairMemoryCeilingBytes,
  windowProcessingMode,
  windowChildInput,
} from './chunked-repair.ts';

async function solid(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

async function rgbAt(image: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const p = await sharp(image).removeAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return [p[0]!, p[1]!, p[2]!];
}

describe('§9.5 window planning', () => {
  it('runs §9.2 unchanged when the range is at most W frames', () => {
    const plan = planChunkedRepair('parent', { a: 100, b: 147 });
    expect(plan.chunked).toBe(false);
    expect(plan.windows).toEqual([]);
    expect(plan.keyframes[0]).toBe(100);
    expect(plan.keyframes.at(-1)).toBe(147);
  });

  it('chunks the first range over W with the exact W/O formula', () => {
    const plan = planChunkedRepair('parent', { a: 0, b: 48 });
    expect(plan.chunked).toBe(true);
    expect(plan.windows.map(({ start, end }) => [start, end])).toEqual([[0, 47], [40, 48]]);
    expect(overlapRange(plan.windows[0]!, plan.windows[1]!)).toEqual({ a: 40, b: 47 });
  });

  it('covers all 300 frames with 8 children (0025 blueprint-count correction)', () => {
    const plan = planChunkedRepair('01PARENT', { a: 0, b: 299 }, { lastFrame: 299 });
    expect(DEFAULT_WINDOW_FRAMES).toBe(48);
    expect(DEFAULT_OVERLAP_FRAMES).toBe(8);
    expect(plan.windows).toHaveLength(8);
    expect(plan.windows.map((w) => w.start)).toEqual([0, 40, 80, 120, 160, 200, 240, 280]);
    expect(plan.windows.at(-1)).toMatchObject({ start: 280, end: 299 });

    const covered = new Set<number>();
    for (const w of plan.windows) for (let frame = w.start; frame <= w.end; frame++) covered.add(frame);
    expect(covered.size).toBe(300);
    expect([...covered].sort((a, b) => a - b)).toEqual(Array.from({ length: 300 }, (_, i) => i));
  });

  it('uses deterministic child keys, padded ranges, carry masks, and one global key set', () => {
    const plan = planChunkedRepair('01PARENT', { a: 10, b: 90 }, { lastFrame: 92, fixedSeed: 8675309 });
    expect(plan.windows.map((w) => w.idempotencyKey)).toEqual(['01PARENT:win:0', '01PARENT:win:1']);
    expect(plan.windows[0]).toMatchObject({ start: 10, end: 57, padded: { start: 6, end: 61 } });
    expect(plan.windows[0]!.carryMaskSeedFrame).toBeUndefined();
    expect(plan.windows[1]).toMatchObject({ start: 50, end: 90, padded: { start: 46, end: 92 }, carryMaskSeedFrame: 50 });
    const shared = plan.windows[0]!.keyframes.filter((k) => plan.windows[1]!.keyframes.includes(k));
    expect(shared).toEqual(plan.keyframes.filter((k) => k >= 50 && k <= 57));
    expect(windowChildInput(plan, plan.windows[1]!)).toMatchObject({
      parentJobId: '01PARENT', windowIndex: 1, fixedSeed: 8675309,
      range: { a: 50, b: 90 }, carryMaskSeedFrame: 50,
    });
  });

  it('rejects configurations that cannot advance safely', () => {
    expect(() => planChunkedRepair('', { a: 0, b: 60 })).toThrow(/parentJobId/);
    expect(() => planChunkedRepair('p', { a: 0, b: 60 }, { overlapFrames: 48 })).toThrow(/smaller/);
    expect(() => planChunkedRepair('p', { a: 10, b: 9 })).toThrow(/before start/);
  });
});

describe('§9.5 resume', () => {
  it('resumes at the first child that has not succeeded', () => {
    const plan = planChunkedRepair('p', { a: 0, b: 299 });
    const statuses = new Map(plan.windows.slice(0, 3).map((w) => [w.index, 'succeeded' as const]));
    expect(firstNonSucceededWindow(plan, statuses)?.index).toBe(3);
    for (const w of plan.windows) statuses.set(w.index, 'succeeded');
    expect(firstNonSucceededWindow(plan, statuses)).toBeUndefined();
  });

  it('executes sequentially from child 4 after the first 3 checkpoints survived a restart', async () => {
    const plan = planChunkedRepair('p', { a: 0, b: 299 }, { fixedSeed: 42 });
    const succeeded = new Set([0, 1, 2]);
    const calls: number[] = [];
    const result = await executeChunkedRepairPlan(plan, {
      status: async (window) => succeeded.has(window.index) ? 'succeeded' : undefined,
      run: async (window, input) => {
        calls.push(window.index);
        expect(input.fixedSeed).toBe(42);
        expect(input.allKeyframes).toEqual(plan.keyframes);
        succeeded.add(window.index);
        return 'succeeded';
      },
    });
    expect(calls).toEqual([3, 4, 5, 6, 7]);
    expect(result).toEqual({ skipped: 3, completed: 5 });
    expect(succeeded.size).toBe(8);
  });
});

describe('§9.5 overlap blending and SSIM', () => {
  it('computes the inclusive 0..1 overlap ramp', () => {
    expect(overlapBlendT(40, 40, 8)).toBe(0);
    expect(overlapBlendT(47, 40, 8)).toBe(1);
    expect(overlapBlendT(43, 40, 8)).toBeCloseTo(3 / 7, 12);
    expect(() => overlapBlendT(48, 40, 8)).toThrow(/outside overlap/);
  });

  it('blends only inside the mask and leaves outside-mask pixels original', async () => {
    const original = await solid(16, 16, { r: 200, g: 20, b: 20 });
    const left = await solid(16, 16, { r: 0, g: 200, b: 0 });
    const right = await solid(16, 16, { r: 0, g: 0, b: 200 });
    const mask = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: await solid(8, 8, { r: 255, g: 255, b: 255 }), left: 4, top: 4 }])
      .png().toBuffer();
    const out = await blendOverlapFrameUnderMask(original, left, right, mask, 0.5);
    const center = await rgbAt(out, 8, 8);
    expect(center[1]).toBeCloseTo(100, -1);
    expect(center[2]).toBeCloseTo(100, -1);
    expect(await rgbAt(out, 1, 1)).toEqual([200, 20, 20]);
  });

  it('reports perfect masked SSIM for identical overlap pixels', async () => {
    const image = await solid(32, 32, { r: 90, g: 110, b: 130 });
    const mask = await solid(32, 32, { r: 255, g: 255, b: 255 });
    expect(await maskedOverlapSsim(image, image, mask)).toBeCloseTo(1, 12);
    expect(await maskedOverlapSsim(image, image, mask)).toBeGreaterThanOrEqual(0.98);
  });
});

describe('§9.5 memory ceiling', () => {
  it('counts at most W + 2*pad decoded native frames', () => {
    expect(nativeWindowBytes(1920, 1080, 48, 4)).toBe(1920 * 1080 * 56 * 4);
  });

  it('switches to proxy tracking only when the configured ceiling is exceeded', () => {
    const bytes = nativeWindowBytes(1920, 1080, 48, 4);
    expect(windowProcessingMode(1920, 1080, bytes)).toBe('native');
    expect(windowProcessingMode(1920, 1080, bytes - 1)).toBe('proxy-tracking-native-keyframes');
  });

  it('requires the ceiling env var instead of hiding 4 GB in code', () => {
    expect(repairMemoryCeilingBytes({ [REPAIR_MEMORY_CEILING_ENV]: '4294967296' })).toBe(4294967296);
    expect(() => repairMemoryCeilingBytes({})).toThrow(/required/);
    expect(() => repairMemoryCeilingBytes({ [REPAIR_MEMORY_CEILING_ENV]: 'nope' })).toThrow(/positive integer/);
  });
});
