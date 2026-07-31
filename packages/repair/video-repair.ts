/**
 * VHE-2 §9.2 — Video repair over range [a..b], DETERMINISTIC CORE (§9.2A).
 *
 * OWNER RULING 2026-07-21 (Eli Q1, recorded in VHE-ISSUE-LOG-0024): build §9.2's deterministic,
 * environment-independent core NOW. The GPU/hosted pieces of §9.2 stay OUT until the real §1 AI
 * fixtures validate repair QUALITY (owner's explicit gate):
 *   • SAM 2 mask tracking (§8), ProPainter removal, RIFE interpolation — local-GPU, absent here.
 *   • provider `video.inpaint` — a hosted path, deferred to the generation layer.
 * §9.2A is everything that can be built and mock-tested with NO key and NO GPU:
 *   1. exact range extraction — the §9.2 "[a−4 .. b+4]" padded window over §6.3;
 *   2. rational frame / keyframe math — the §9.2 key set {a, a+s, …, b} (stride 4–6, force b) and
 *      the RIFE interpolation parameter t=(f−k1)/(k2−k1);
 *   3. absolute↔local index translation — the §8 rule `absolute = rangeStart + local`;
 *   4. mask-only compositing — the §9.2 rule out[f]=frame[f]·(1−m)+patch[f]·m, per frame, reusing
 *      §9.1's `compositeUnderMask`;
 *   5. provider-output contract validation — one image patch per keyframe (reuses §7's validator);
 *   6. preview-window assembly — §9.2 "Preview renders only [a−4 .. b+4]" via the §6 wrapper.
 *
 * Like §9.1 (VHE-ISSUE-LOG-0020), §9.2 in VHE-2 is PROSE — no verbatim code block and no formal
 * exit gate. This module implements the described algorithm; correctness is pinned by mock tests.
 *
 * §0 rules honored: every FFmpeg invocation goes through the §6 wrapper (media/ffmpeg.ts) — this
 * module builds NO ffmpeg strings. Frame indices are integers; fps is carried as num/den rationals
 * only (no floating-point fps ever appears here).
 */

import { extractFrameRangeArgs, encodeMidArgs } from '../media/ffmpeg.ts';
import { compositeUnderMask, type PixelBox } from './inpaint.ts';
import { validateProviderOutputs, type ProviderNativeOutput } from '../providers/execution-context.ts';

// ── 1. Exact range extraction — §9.2 "Extract frames [a−4 .. b+4]" ─────────────────────────────

/** §9.2: "4-frame pad for temporal context." */
export const DEFAULT_TEMPORAL_PAD = 4;

/** Inclusive absolute frame range the user asked to repair. */
export interface RepairRange {
  a: number;
  b: number;
}

/** The padded, clamped extraction window actually pulled from the clip. */
export interface PaddedRange {
  /** First absolute frame extracted (a − pad, clamped to ≥ 0). */
  start: number;
  /** Last absolute frame extracted (b + pad, clamped to ≤ lastFrame when known). */
  end: number;
  pad: number;
}

function assertValidRange(range: RepairRange): void {
  const { a, b } = range;
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error(`repair range must be integer frames, got [${a}..${b}]`);
  if (a < 0) throw new Error(`repair range start must be ≥ 0, got ${a}`);
  if (b < a) throw new Error(`repair range end ${b} is before start ${a}`);
}

/** Compute the §9.2 padded window [a−pad .. b+pad], clamped to the clip's frame bounds. */
export function paddedExtractionRange(
  range: RepairRange,
  opts: { pad?: number; lastFrame?: number } = {},
): PaddedRange {
  assertValidRange(range);
  const pad = opts.pad ?? DEFAULT_TEMPORAL_PAD;
  if (!Number.isInteger(pad) || pad < 0) throw new Error(`temporal pad must be a non-negative integer, got ${pad}`);
  const start = Math.max(0, range.a - pad);
  let end = range.b + pad;
  if (opts.lastFrame !== undefined) end = Math.min(end, opts.lastFrame);
  return { start, end, pad };
}

/**
 * Build the §6.3 frame-extraction args for a repair range's padded window. Returns both the args
 * (to hand to the §6 wrapper's runFfmpeg) and the resolved PaddedRange the caller needs for
 * numbering/compositing. fps is a rational (num/den) — never a float.
 */
export function extractionArgsForRepair(
  input: string,
  range: RepairRange,
  num: number,
  den: number,
  outDir: string,
  opts: { pad?: number; lastFrame?: number } = {},
): { args: string[]; padded: PaddedRange } {
  const padded = paddedExtractionRange(range, opts);
  const args = extractFrameRangeArgs(input, padded.start, padded.end, num, den, outDir);
  return { args, padded };
}

// ── 2. Rational frame / keyframe math — §9.2 key set + RIFE interpolation ────────────────────────

/** §9.2: "stride s = 4–6". */
export const DEFAULT_KEYFRAME_STRIDE = 4;
export const MIN_KEYFRAME_STRIDE = 4;
export const MAX_KEYFRAME_STRIDE = 6;

/**
 * §9.2 content-replacement key set: "inpaint frames a, a+s, …, b (stride s = 4–6, always force b
 * into the key set)". Returns strictly ascending, de-duplicated absolute frame indices. When a===b
 * the single frame is the only key. Per §9.5 this set is computed ONCE on ABSOLUTE indices.
 */
export function keyframeSet(a: number, b: number, stride: number = DEFAULT_KEYFRAME_STRIDE): number[] {
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error(`keyframeSet needs integer frames, got [${a}..${b}]`);
  if (b < a) throw new Error(`keyframeSet end ${b} is before start ${a}`);
  if (!Number.isInteger(stride) || stride < MIN_KEYFRAME_STRIDE || stride > MAX_KEYFRAME_STRIDE) {
    throw new Error(`keyframe stride must be an integer in [${MIN_KEYFRAME_STRIDE}..${MAX_KEYFRAME_STRIDE}] (§9.2), got ${stride}`);
  }
  const keys: number[] = [];
  for (let f = a; f <= b; f += stride) keys.push(f);
  if (keys[keys.length - 1] !== b) keys.push(b); // "always force b into the key set"
  return keys;
}

/**
 * The two key frames bracketing a non-key frame f (k1 < f < k2), or null when f is itself a key or
 * lies outside the key span. `keys` must be the ascending set from `keyframeSet`.
 */
export function bracketingKeyframes(f: number, keys: number[]): { k1: number; k2: number } | null {
  if (keys.length < 2 || f <= keys[0]! || f >= keys[keys.length - 1]!) return null;
  for (let i = 0; i < keys.length - 1; i++) {
    if (f > keys[i]! && f < keys[i + 1]!) return { k1: keys[i]!, k2: keys[i + 1]! };
    if (f === keys[i]!) return null; // f is a key
  }
  return null;
}

/**
 * §9.2 RIFE blend parameter t = (f − k1) / (k2 − k1), the fraction of the way from key k1 to key
 * k2 at frame f. Deterministic even though RIFE itself is GPU-blocked — this is the math RIFE is
 * driven with. Returns a value in (0,1) for k1 < f < k2.
 */
export function interpolationT(f: number, k1: number, k2: number): number {
  if (k2 <= k1) throw new Error(`interpolationT needs k1 < k2, got k1=${k1} k2=${k2}`);
  if (f <= k1 || f >= k2) throw new Error(`interpolationT needs k1 < f < k2, got f=${f} in (${k1},${k2})`);
  return (f - k1) / (k2 - k1);
}

// ── 3. Absolute ↔ local index translation — §8 "absolute = rangeStart + local" ──────────────────

/** §8: a frame's absolute clip index from its local index within an extracted range. */
export function localToAbsolute(local: number, rangeStart: number): number {
  return rangeStart + local;
}

/** §8 inverse: a frame's local index within an extracted range from its absolute clip index. */
export function absoluteToLocal(absolute: number, rangeStart: number): number {
  return absolute - rangeStart;
}

/**
 * The subset of a key set that falls inside an inclusive [start..end] window — §9.5's "every window
 * inpaints only the keys that fall inside it", computed here on absolute indices.
 */
export function keyframesInRange(keys: number[], start: number, end: number): number[] {
  return keys.filter((k) => k >= start && k <= end);
}

// ── 4. Mask-only per-frame compositing — §9.2 out[f]=frame[f]·(1−m)+patch[f]·m ───────────────────

/** One repaired frame's patch, box, and box-cropped feathered mask (the §9.2 per-frame inputs). */
export interface FramePatch {
  /** Absolute frame index this patch repairs. */
  frame: number;
  /** The repaired crop (provider/RIFE output), box-sized. */
  patch: Buffer;
  /** The crop rectangle in native pixels. */
  box: PixelBox;
  /** The box-sized crop of this frame's feathered §5 mask (white = edit). */
  maskCrop: Buffer;
}

/**
 * Composite one repaired patch into its original full frame under the feathered mask — the §9.2
 * rule out = frame·(1−mask) + patch·mask, applied to a single frame by reusing §9.1's
 * `compositeUnderMask`. Non-destructive: only the original bytes are read.
 */
export async function compositeFrameUnderMask(originalFrame: Buffer, fp: FramePatch): Promise<Buffer> {
  return compositeUnderMask(originalFrame, fp.patch, fp.maskCrop, fp.box);
}

/**
 * Composite an entire repaired range: for each patched frame, apply the §9.2 mask rule; frames
 * with no patch pass through untouched (§9.5 "Outside the mask, frames are untouched originals").
 * `frames` is keyed by absolute frame index; the returned map has the same keys, composited where
 * a patch existed. Throws if a patch references a frame that was not extracted.
 */
export async function compositeRangeUnderMask(
  frames: Map<number, Buffer>,
  patches: FramePatch[],
): Promise<Map<number, Buffer>> {
  const out = new Map<number, Buffer>(frames);
  for (const fp of patches) {
    const original = frames.get(fp.frame);
    if (!original) throw new Error(`compositeRangeUnderMask: no extracted frame ${fp.frame} for its patch`);
    out.set(fp.frame, await compositeFrameUnderMask(original, fp));
  }
  return out;
}

// ── 5. Provider-output contract validation — one image patch per keyframe ────────────────────────

/**
 * Validate that a provider returned exactly one image patch per keyframe (the §9.2 content-
 * replacement path inpaints each key). Reuses §7's `validateProviderOutputs` (bytes/url + non-empty
 * + mime family) and adds the per-keyframe count check. Throws PROVIDER_REJECTED on any violation.
 */
export function validateKeyframePatchOutputs(keySet: number[], outputs: ProviderNativeOutput[]): ProviderNativeOutput[] {
  validateProviderOutputs(outputs, { minOutputs: keySet.length, rejectEmpty: true, expectMimePrefix: 'image' });
  if (outputs.length !== keySet.length) {
    throw new Error(`expected exactly ${keySet.length} keyframe patches (one per key), got ${outputs.length}`);
  }
  return outputs;
}

// ── 6. Preview-window assembly — §9.2 "Preview renders only [a−4 .. b+4]" ────────────────────────

/**
 * Build the FFmpeg args that encode the composited padded window into a preview clip. §9.2 is
 * explicit: the preview renders ONLY [a−pad .. b+pad], never the whole clip. The numbered-PNG →
 * mp4 operation is exactly the §6.4 Step-3 middle-encode recipe, so this reuses the §6 wrapper's
 * `encodeMidArgs` (start_number = the padded window's first absolute frame) — no new ffmpeg string.
 * `framesPattern` is the printf-style path (e.g. `dir/%07d.png`) the composited frames were written
 * under, numbered by ABSOLUTE frame index to match §6.3's `-start_number`.
 */
export function previewWindowEncodeArgs(
  framesPattern: string,
  padded: PaddedRange,
  num: number,
  den: number,
  outMp4: string,
): string[] {
  return encodeMidArgs(framesPattern, padded.start, num, den, outMp4);
}
