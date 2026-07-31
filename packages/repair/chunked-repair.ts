/**
 * VHE-2 §9.5 — deterministic core for chunked repair windows.
 *
 * Long inclusive ranges are split into overlapping child windows. This module owns only the
 * environment-independent contract: planning, deterministic child keys, resume selection,
 * overlap blending/SSIM, and the memory-mode decision. GPU/provider execution remains behind
 * §9.2's existing gate.
 *
 * VHE-ISSUE-LOG-0025: the blueprint's 300-frame/7-child exit-gate sentence contradicts its own
 * W=48/O=8 formula. Complete coverage requires 8 children; the formula and frame coverage win.
 */

import sharp from 'sharp';
import {
  DEFAULT_KEYFRAME_STRIDE,
  DEFAULT_TEMPORAL_PAD,
  keyframeSet,
  keyframesInRange,
  paddedExtractionRange,
  type PaddedRange,
  type RepairRange,
} from './video-repair.ts';

export const DEFAULT_WINDOW_FRAMES = 48;
export const DEFAULT_OVERLAP_FRAMES = 8;
export const REPAIR_MEMORY_CEILING_ENV = 'VHE_REPAIR_MEMORY_CEILING_BYTES';

export interface RepairWindow {
  index: number;
  start: number;
  end: number;
  padded: PaddedRange;
  keyframes: number[];
  idempotencyKey: string;
  /** §9.5: every later SAM window seeds from the prior window's mask at this overlap frame. */
  carryMaskSeedFrame?: number;
}

export interface ChunkedRepairPlan {
  parentJobId: string;
  range: RepairRange;
  chunked: boolean;
  windowFrames: number;
  overlapFrames: number;
  pad: number;
  keyframes: number[];
  fixedSeed?: number;
  windows: RepairWindow[];
}

export interface ChunkPlanOptions {
  windowFrames?: number;
  overlapFrames?: number;
  pad?: number;
  keyframeStride?: number;
  lastFrame?: number;
  fixedSeed?: number;
}

function positiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got ${value}`);
}

/**
 * Build §9.5's complete parent plan. A range of at most W frames returns `chunked:false` and no
 * child windows: the caller must run §9.2 exactly as written. Long ranges return one entry per
 * child job, with absolute global keyframes computed once before any window runs.
 */
export function planChunkedRepair(
  parentJobId: string,
  range: RepairRange,
  opts: ChunkPlanOptions = {},
): ChunkedRepairPlan {
  if (!parentJobId.trim()) throw new Error('parentJobId is required for deterministic child keys');
  // Reuse §9.2 validation, including integer/non-negative/inclusive ordering checks.
  paddedExtractionRange(range, { pad: 0, lastFrame: opts.lastFrame });

  const windowFrames = opts.windowFrames ?? DEFAULT_WINDOW_FRAMES;
  const overlapFrames = opts.overlapFrames ?? DEFAULT_OVERLAP_FRAMES;
  const pad = opts.pad ?? DEFAULT_TEMPORAL_PAD;
  const stride = opts.keyframeStride ?? DEFAULT_KEYFRAME_STRIDE;
  positiveInteger('windowFrames', windowFrames);
  positiveInteger('overlapFrames', overlapFrames);
  if (overlapFrames >= windowFrames) {
    throw new Error(`overlapFrames must be smaller than windowFrames, got O=${overlapFrames}, W=${windowFrames}`);
  }
  if (!Number.isInteger(pad) || pad < 0) throw new Error(`pad must be a non-negative integer, got ${pad}`);
  if (opts.fixedSeed !== undefined && (!Number.isInteger(opts.fixedSeed) || opts.fixedSeed < 0)) {
    throw new Error(`fixedSeed must be a non-negative integer, got ${opts.fixedSeed}`);
  }

  const keys = keyframeSet(range.a, range.b, stride);
  const length = range.b - range.a + 1;
  const base: Omit<ChunkedRepairPlan, 'chunked' | 'windows'> = {
    parentJobId,
    range: { ...range },
    windowFrames,
    overlapFrames,
    pad,
    keyframes: keys,
    ...(opts.fixedSeed === undefined ? {} : { fixedSeed: opts.fixedSeed }),
  };
  if (length <= windowFrames) return { ...base, chunked: false, windows: [] };

  const windows: RepairWindow[] = [];
  const step = windowFrames - overlapFrames;
  for (let start = range.a, index = 0; start <= range.b; start += step, index++) {
    const end = Math.min(range.b, start + windowFrames - 1);
    windows.push({
      index,
      start,
      end,
      padded: paddedExtractionRange({ a: start, b: end }, { pad, lastFrame: opts.lastFrame }),
      keyframes: keyframesInRange(keys, start, end),
      idempotencyKey: `${parentJobId}:win:${index}`,
      ...(index === 0 ? {} : { carryMaskSeedFrame: start }),
    });
    if (end === range.b) break;
  }
  return { ...base, chunked: true, windows };
}

export type ChildStatus = 'queued' | 'running' | 'awaiting_approval' | 'succeeded' | 'failed' | 'canceled';

/** §9.5 resume rule: the first absent/non-succeeded child is the next unit of work. */
export function firstNonSucceededWindow(
  plan: ChunkedRepairPlan,
  statusByIndex: ReadonlyMap<number, ChildStatus>,
): RepairWindow | undefined {
  return plan.windows.find((window) => statusByIndex.get(window.index) !== 'succeeded');
}

export interface RepairWindowChildInput {
  parentJobId: string;
  windowIndex: number;
  range: RepairRange;
  padded: PaddedRange;
  keyframes: number[];
  allKeyframes: number[];
  fixedSeed?: number;
  carryMaskSeedFrame?: number;
}

/** The deterministic payload stored in each `repair.range` child job. */
export function windowChildInput(plan: ChunkedRepairPlan, window: RepairWindow): RepairWindowChildInput {
  if (plan.windows[window.index] !== window) throw new Error(`window ${window.index} does not belong to this plan`);
  return {
    parentJobId: plan.parentJobId,
    windowIndex: window.index,
    range: { a: window.start, b: window.end },
    padded: { ...window.padded },
    keyframes: [...window.keyframes],
    allKeyframes: [...plan.keyframes],
    ...(plan.fixedSeed === undefined ? {} : { fixedSeed: plan.fixedSeed }),
    ...(window.carryMaskSeedFrame === undefined ? {} : { carryMaskSeedFrame: window.carryMaskSeedFrame }),
  };
}

/**
 * Sequential resumable execution seam. Existing succeeded children are skipped; each missing or
 * non-succeeded child must finish before the next begins. Production supplies DB-backed status and
 * §4 child creation/awaiting through these callbacks; tests can simulate a worker restart exactly.
 */
export async function executeChunkedRepairPlan(
  plan: ChunkedRepairPlan,
  deps: {
    status: (window: RepairWindow) => Promise<ChildStatus | undefined>;
    run: (window: RepairWindow, input: RepairWindowChildInput) => Promise<'succeeded'>;
  },
): Promise<{ skipped: number; completed: number }> {
  if (!plan.chunked) throw new Error('executeChunkedRepairPlan only accepts a chunked plan; run §9.2 directly');
  let skipped = 0;
  let completed = 0;
  for (const window of plan.windows) {
    if (await deps.status(window) === 'succeeded') {
      skipped++;
      continue;
    }
    const result = await deps.run(window, windowChildInput(plan, window));
    if (result !== 'succeeded') throw new Error(`window ${window.index} did not reach succeeded`);
    completed++;
  }
  return { skipped, completed };
}

/** Resolve and validate the exact O-frame overlap between adjacent planned windows. */
export function overlapRange(left: RepairWindow, right: RepairWindow): RepairRange {
  if (right.index !== left.index + 1) throw new Error('overlapRange requires adjacent window indices');
  const a = right.start;
  const b = Math.min(left.end, right.end);
  if (b < a) throw new Error(`windows ${left.index}/${right.index} do not overlap`);
  return { a, b };
}

/** §9.5 linear ramp: t=(f-overlapStart)/(O-1), inclusive endpoints 0..1. */
export function overlapBlendT(frame: number, overlapStart: number, overlapFrames: number): number {
  if (!Number.isInteger(frame) || !Number.isInteger(overlapStart)) throw new Error('overlap frames must be integers');
  if (!Number.isInteger(overlapFrames) || overlapFrames < 2) throw new Error('overlapFrames must be an integer ≥ 2');
  const t = (frame - overlapStart) / (overlapFrames - 1);
  if (t < 0 || t > 1) throw new Error(`frame ${frame} is outside overlap [${overlapStart}..${overlapStart + overlapFrames - 1}]`);
  return t;
}

async function rgba(image: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const decoded = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: decoded.data, width: decoded.info.width, height: decoded.info.height };
}

async function maskWeights(mask: Buffer, width: number, height: number): Promise<Buffer> {
  const decoded = await sharp(mask).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== width || decoded.info.height !== height) throw new Error('mask dimensions do not match overlap frame');
  return decoded.data;
}

/**
 * Blend both repaired frames across an overlap, then composite that blend over the original only
 * where the tracked mask is non-zero. Outside-mask original pixels remain numerically unchanged.
 */
export async function blendOverlapFrameUnderMask(
  original: Buffer,
  repairedLeft: Buffer,
  repairedRight: Buffer,
  trackedMask: Buffer,
  t: number,
): Promise<Buffer> {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error(`blend t must be within [0,1], got ${t}`);
  const [o, left, right] = await Promise.all([rgba(original), rgba(repairedLeft), rgba(repairedRight)]);
  if (left.width !== o.width || left.height !== o.height || right.width !== o.width || right.height !== o.height) {
    throw new Error('overlap frame dimensions must match');
  }
  const mask = await maskWeights(trackedMask, o.width, o.height);
  const out = Buffer.allocUnsafe(o.data.length);
  for (let pixel = 0; pixel < o.width * o.height; pixel++) {
    const m = mask[pixel]! / 255;
    const base = pixel * 4;
    for (let channel = 0; channel < 3; channel++) {
      const repaired = left.data[base + channel]! * (1 - t) + right.data[base + channel]! * t;
      out[base + channel] = Math.round(o.data[base + channel]! * (1 - m) + repaired * m);
    }
    out[base + 3] = o.data[base + 3]!;
  }
  return sharp(out, { raw: { width: o.width, height: o.height, channels: 4 } }).png().toBuffer();
}

/** Mask-weighted global SSIM for §9.5's overlap-quality gate. */
export async function maskedOverlapSsim(leftImage: Buffer, rightImage: Buffer, trackedMask: Buffer): Promise<number> {
  const [left, right] = await Promise.all([rgba(leftImage), rgba(rightImage)]);
  if (left.width !== right.width || left.height !== right.height) throw new Error('SSIM frame dimensions must match');
  const mask = await maskWeights(trackedMask, left.width, left.height);
  let weight = 0;
  let meanLeft = 0;
  let meanRight = 0;
  const luma = (data: Buffer, base: number) => 0.299 * data[base]! + 0.587 * data[base + 1]! + 0.114 * data[base + 2]!;
  for (let pixel = 0; pixel < left.width * left.height; pixel++) {
    const w = mask[pixel]! / 255;
    if (w === 0) continue;
    const base = pixel * 4;
    weight += w;
    meanLeft += w * luma(left.data, base);
    meanRight += w * luma(right.data, base);
  }
  if (weight === 0) throw new Error('SSIM mask contains no repair pixels');
  meanLeft /= weight;
  meanRight /= weight;

  let varianceLeft = 0;
  let varianceRight = 0;
  let covariance = 0;
  for (let pixel = 0; pixel < left.width * left.height; pixel++) {
    const w = mask[pixel]! / 255;
    if (w === 0) continue;
    const base = pixel * 4;
    const dl = luma(left.data, base) - meanLeft;
    const dr = luma(right.data, base) - meanRight;
    varianceLeft += w * dl * dl;
    varianceRight += w * dr * dr;
    covariance += w * dl * dr;
  }
  varianceLeft /= weight;
  varianceRight /= weight;
  covariance /= weight;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  return ((2 * meanLeft * meanRight + c1) * (2 * covariance + c2)) /
    ((meanLeft ** 2 + meanRight ** 2 + c1) * (varianceLeft + varianceRight + c2));
}

export type WindowProcessingMode = 'native' | 'proxy-tracking-native-keyframes';

export function nativeWindowBytes(width: number, height: number, windowFrames: number, pad: number, bytesPerPixel = 4): number {
  for (const [name, value] of Object.entries({ width, height, windowFrames, bytesPerPixel })) positiveInteger(name, value);
  if (!Number.isInteger(pad) || pad < 0) throw new Error(`pad must be a non-negative integer, got ${pad}`);
  const bytes = width * height * (windowFrames + 2 * pad) * bytesPerPixel;
  if (!Number.isSafeInteger(bytes)) throw new Error('native window byte estimate exceeds safe integer range');
  return bytes;
}

/** §9.5 memory rule: above the configured ceiling, track on proxy and decode native keys singly. */
export function windowProcessingMode(
  width: number,
  height: number,
  memoryCeilingBytes: number,
  opts: { windowFrames?: number; pad?: number; bytesPerPixel?: number } = {},
): WindowProcessingMode {
  positiveInteger('memoryCeilingBytes', memoryCeilingBytes);
  const bytes = nativeWindowBytes(
    width,
    height,
    opts.windowFrames ?? DEFAULT_WINDOW_FRAMES,
    opts.pad ?? DEFAULT_TEMPORAL_PAD,
    opts.bytesPerPixel ?? 4,
  );
  return bytes > memoryCeilingBytes ? 'proxy-tracking-native-keyframes' : 'native';
}

/** Read the required §9.5 ceiling from configuration; no 4 GB literal is hidden in code. */
export function repairMemoryCeilingBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[REPAIR_MEMORY_CEILING_ENV];
  if (!raw) throw new Error(`${REPAIR_MEMORY_CEILING_ENV} is required`);
  const value = Number(raw);
  positiveInteger(REPAIR_MEMORY_CEILING_ENV, value);
  return value;
}
