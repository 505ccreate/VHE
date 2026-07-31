/**
 * VHE-2 §9.1 — Image inpaint (repair pipeline for a single still).
 *
 * §9.1 is PROSE in VHE-2 (no verbatim code block, and — confirmed against
 * `word/document.xml` — no stated exit gate), so this is an implementation of the
 * described pipeline, not a transcription. Every non-obvious choice is recorded in
 * VHE-ISSUE-LOG-0020. The steps, in the blueprint's own order:
 *
 *   1. Rasterize the mask at asset resolution, feathered              → §5 rasterizeMask.
 *   2. Crop-inpaint-paste for large assets: crop source+mask to the mask's bounding
 *      box + 25% margin (clamped), inpaint the crop, paste back under the feathered
 *      mask. Keeps quality up and cost down.
 *   3. Compile the prompt: "{user_instruction}. {auto_context}. Match the surrounding
 *      lighting, color grade, grain and perspective exactly. Seamless edges." with the
 *      negative default below. User text always outranks the template on conflict.
 *   4. Route image.inpaint (§7 runGeneration), request 2–4 candidates, composite each
 *      behind the mask, present before/after. Apply = append a §11 edit-graph node;
 *      pixels never destroyed.
 *
 * HARDENED in VHE-ISSUE-LOG-0021 (Eli §9.1 review): the crop box now contains the mask
 * feather; oversized crops are downscaled to the provider max and composited back at full
 * res (no longer "routed around"); zero-candidate provider results are rejected; ICC/EXIF
 * metadata is preserved through the composite; user "keep X" requests drop the conflicting
 * default-negative term; inputs are validated.
 *
 * DEFERRED (flagged, not invented — VHE-ISSUE-LOG-0020 / 0021):
 *   - Step 4 "Apply = append a §11 edit-graph node": §11 is not built yet. This module
 *     returns the before/after candidates; wiring the non-destructive apply is a
 *     §11-time follow-up. Nothing here destroys the source (it is only read).
 *   - Storage is an injected dependency (loadImage/storeImage). No S3 read/write helper
 *     is built here — that belongs to a storage package, outside §9.1's scope. This
 *     mirrors how §7 injected `query`, keeping the image core deterministic and testable.
 *   - Orientation normalization belongs at ingest (§3): the composite preserves metadata
 *     but does NOT re-orient. §9.1 assumes stored pixels already match assetWidth×Height.
 *     Flagged as a §3 owner-policy item in 0021 (not bodged into the still pipeline).
 */

import sharp from 'sharp';
import { MaskObject, rasterizeMask } from '../masks/masks.ts';
import type { GenRequest, GenResult, Capability } from '../providers/types.ts';
import type { ProviderConnection } from '../providers/routing.ts';
import type { RunGenerationOpts, RunGenerationResult } from '../providers/registry.ts';
import { ApiError } from '../jobs/errors.ts';

/**
 * Verbatim product strings from VHE-2 §9.1 (`word/document.xml`, not the lossy mirror).
 * These are what the model actually receives, so they are copied exactly.
 */
export const INPAINT_TEMPLATE_SUFFIX =
  'Match the surrounding lighting, color grade, grain and perspective exactly. Seamless edges.';

/**
 * The §9.1 default negative as an ordered term list. INPAINT_NEGATIVE_DEFAULT is derived
 * by joining it, so the product wording stays byte-identical to the blueprint while the
 * list form lets the prompt compiler drop a single term when the user explicitly asks to
 * keep the thing it would suppress (VHE-ISSUE-LOG-0021 — "user text always outranks the
 * template on conflict").
 */
export const INPAINT_NEGATIVE_TERMS: readonly string[] = [
  'extra fingers', 'deformed hands', 'warped', 'blurry seam',
  'duplicated features', 'text artifacts', 'watermark',
];
export const INPAINT_NEGATIVE_DEFAULT = INPAINT_NEGATIVE_TERMS.join(', ');

/** Integer-pixel crop rectangle. */
export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Union bounding box of every shape in a mask, in pixels at W×H, grown by `marginFrac`
 * on each side (plus a feather pad, see below) and clamped to the frame. `points` masks
 * must be SAM-resolved first (same rule as rasterizeMask). `marginFrac` default 0.25
 * realizes the blueprint's "+ 25% margin" as a per-side grow of 25% of the box's own
 * dimension (see 0020) — which makes the crop 1.5× the box in each dimension, not 2×.
 *
 * `featherPx` (native px) additionally pads each side by ≈1.5·featherPx. rasterizeMask
 * blurs the mask by a Gaussian of sigma≈featherPx/2, whose influence reaches ≈3·sigma =
 * 1.5·featherPx beyond the vector shape; if the crop does not contain that, paste-back
 * guillotines the feather and leaves a visible seam (VHE-ISSUE-LOG-0021). `featherPx`
 * defaults to 0 so pure geometry callers/tests are unaffected.
 */
export function maskBoundingBoxPx(
  m: MaskObject,
  W: number,
  H: number,
  marginFrac = 0.25,
  featherPx = 0,
): PixelBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (px: number, py: number, rx = 0, ry = 0) => {
    if (px - rx < minX) minX = px - rx;
    if (py - ry < minY) minY = py - ry;
    if (px + rx > maxX) maxX = px + rx;
    if (py + ry > maxY) maxY = py + ry;
  };

  for (const s of m.shapes) {
    switch (s.t) {
      case 'rect':
        extend(s.x * W, s.y * H);
        extend((s.x + s.w) * W, (s.y + s.h) * H);
        break;
      case 'polygon':
        for (const [x, y] of s.points) extend(x * W, y * H);
        break;
      case 'stroke': {
        // radius is normalized to WIDTH (§5) → radius*W px in every direction (round cap).
        const r = s.radius * W;
        for (const [x, y] of s.points) extend(x * W, y * H, r, r);
        break;
      }
      case 'points':
        throw new Error('points-mask must be resolved by SAM before inpaint (§9.1 → §8)');
    }
  }

  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const mx = boxW * marginFrac;
  const my = boxH * marginFrac;
  // Feather reaches ≈1.5·featherPx beyond the shape; pad each side so the crop contains it.
  // Guard on >0 so the default (0) leaves pure-geometry results byte-for-byte unchanged.
  const fpad = featherPx > 0 ? Math.ceil(featherPx * 1.5) + 1 : 0;

  const x0 = Math.max(0, Math.floor(minX - mx - fpad));
  const y0 = Math.max(0, Math.floor(minY - my - fpad));
  const x1 = Math.min(W, Math.ceil(maxX + mx + fpad));
  const y1 = Math.min(H, Math.ceil(maxY + my + fpad));

  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Clamp a requested candidate count to the §9.1 "2–4 candidates" band (default 3). */
export function clampCandidateCount(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return 3;
  return Math.max(2, Math.min(4, Math.trunc(n)));
}

export interface ProviderLimit {
  maxWidth: number;
  maxHeight: number;
}

/**
 * Blueprint §9.1: the crop is "clamped to provider maxWidth/Height." Proportionally shrink
 * a submit size so it fits within the provider's max dims — never upscales (a crop already
 * within limits is returned unchanged, scale 1). The repaired patch is composited back at
 * FULL crop resolution, so this reduces only what is SENT to the provider, and replaces the
 * earlier "route around oversized crops" behavior Eli rejected (VHE-ISSUE-LOG-0021).
 */
export function fitBoxToProviderLimit(
  box: PixelBox,
  limit: ProviderLimit,
): { submitW: number; submitH: number; scale: number } {
  const scale = Math.min(1, limit.maxWidth / box.w, limit.maxHeight / box.h);
  if (!(scale < 1)) return { submitW: box.w, submitH: box.h, scale: 1 };
  return {
    submitW: Math.max(1, Math.floor(box.w * scale)),
    submitH: Math.max(1, Math.floor(box.h * scale)),
    scale,
  };
}

/**
 * DESIGN DECISION (VHE-ISSUE-LOG-0021, flagged for owner/Eli review): to size-clamp the
 * crop we need a target max, but routing (§7) picks the provider *after* the request is
 * built. Rather than couple resize logic into §7's generic chain walk, §9.1 clamps to the
 * LARGEST maxWidth/maxHeight among the owner's connections that advertise `image.inpaint`
 * WITH mask support — i.e. make the crop routable to the highest-capacity eligible
 * provider. This reads manifests only (loadConnections is key-free), so no secret is
 * touched. Alternative considered but not chosen: clamp to the head-of-chain provider.
 * Returns undefined when no eligible connection exists (caller then submits unclamped and
 * routing fails fast with NO_PROVIDER exactly as before).
 */
export function resolveInpaintProviderLimit(
  connections: ProviderConnection[],
  capability: Capability = 'image.inpaint',
): ProviderLimit | undefined {
  let maxWidth = 0;
  let maxHeight = 0;
  for (const c of connections) {
    const cap = c.manifest.capabilities[capability];
    if (!cap || !cap.supportsMask) continue;
    if (cap.maxWidth > maxWidth) maxWidth = cap.maxWidth;
    if (cap.maxHeight > maxHeight) maxHeight = cap.maxHeight;
  }
  return maxWidth > 0 && maxHeight > 0 ? { maxWidth, maxHeight } : undefined;
}

export interface CompiledPrompt {
  prompt: string;
  negativePrompt: string;
}

/**
 * Bounded prompt-conflict resolution (VHE-ISSUE-LOG-0021, owner+Eli ruling). "User text
 * always outranks the template on conflict" is more than ordering: if the user asks to
 * KEEP or ADD something a default negative would suppress (e.g. "keep the watermark" vs
 * default negative "watermark"), that one default term is dropped so the model is not sent
 * a contradiction. This is deliberately a small keyword heuristic, NOT a general
 * prompt-policy engine (explicitly out of scope this phase).
 *
 * Known limits (documented, accepted for this phase): it fires when a preserve/add intent
 * word co-occurs with a concept keyword, so a negated request ("don't add extra fingers")
 * can mis-fire. The target is the common, safe case (keep the watermark / keep the text /
 * deliberate blur). Hand/finger keywords are intentionally narrow ("stylized hand", "extra
 * finger") so ordinary "fix the hand" repairs keep their protective negatives.
 */
const NEGATIVE_CONFLICT_KEYWORDS: Record<string, readonly string[]> = {
  'watermark': ['watermark', 'logo'],
  'text artifacts': ['text', 'lettering', 'caption', 'typography', 'signage'],
  'blurry seam': ['blur', 'blurry', 'bokeh', 'soft focus', 'soft-focus'],
  'duplicated features': ['duplicate', 'twin', 'mirrored', 'symmetry', 'symmetrical'],
  'warped': ['warp', 'distort', 'melt', 'surreal'],
  'deformed hands': ['stylized hand', 'stylised hand', 'artistic hand', 'distorted hand'],
  'extra fingers': ['extra finger', 'six finger', 'six-finger'],
};
const PRESERVE_INTENT =
  /\b(keep|keeps|keeping|kept|preserve|preserves|preserving|retain|retains|leave|leaving|maintain|maintains|include|including|add|adds|adding|intentional|intentionally|deliberate|deliberately|stylized|stylised|artistic)\b/i;

/**
 * The default-negative terms that conflict with an explicit user request to keep/add
 * something, and should therefore be dropped from the negative prompt for this instruction.
 */
export function conflictingNegativeTerms(userInstruction: string): string[] {
  const text = userInstruction.toLowerCase();
  if (!PRESERVE_INTENT.test(text)) return [];
  const drop: string[] = [];
  for (const term of INPAINT_NEGATIVE_TERMS) {
    const kws = NEGATIVE_CONFLICT_KEYWORDS[term] ?? [];
    if (kws.some((k) => text.includes(k))) drop.push(term);
  }
  return drop;
}

/**
 * Compile the §9.1 prompt. `autoContext` is optional and caller-supplied (e.g. §9.4
 * hands over "possible hand anomaly, frames 141–167"); a plain user repair supplies
 * none and the clause is omitted — no auto-context is invented here (0020).
 *
 * "User text always outranks the template on conflict" is realized as precedence
 * ordering: the user instruction leads the positive prompt and user negatives lead the
 * negative prompt, with the template defaults following.
 */
export function compileInpaintPrompt(input: {
  userInstruction: string;
  autoContext?: string;
  userNegative?: string;
}): CompiledPrompt {
  const sentences = [input.userInstruction.trim()];
  const ctx = input.autoContext?.trim();
  if (ctx) sentences.push(ctx);
  const prompt = `${sentences.join('. ')}. ${INPAINT_TEMPLATE_SUFFIX}`;

  const neg: string[] = [];
  const userNeg = input.userNegative?.trim();
  if (userNeg) neg.push(userNeg); // user first → outranks the template
  // Drop only the default terms the user explicitly asked to keep/add (bounded, 0021).
  const drop = new Set(conflictingNegativeTerms(input.userInstruction));
  const keptDefaults = INPAINT_NEGATIVE_TERMS.filter((t) => !drop.has(t));
  if (keptDefaults.length > 0) neg.push(keptDefaults.join(', '));
  const negativePrompt = neg.join(', ');

  return { prompt, negativePrompt };
}

/** Crop a full-frame image buffer to `box`. */
export async function cropToBox(image: Buffer, box: PixelBox): Promise<Buffer> {
  return sharp(image)
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .toBuffer();
}

/**
 * Paste a box-sized `patch` back into the full-frame `original` at `box`, but only
 * inside the feathered mask — the §9.2 composite rule applied to a still:
 *
 *   out = original·(1 − mask) + patch·mask     (mask = feathered alpha)
 *
 * Implemented by making the (feathered greyscale) mask crop the patch's alpha channel
 * and compositing "over" at the box offset — Porter-Duff "over" is exactly that blend.
 * `maskCrop` is the box-sized crop of the §5 rasterized (feathered) mask; white = edit.
 */
export async function compositeUnderMask(
  original: Buffer,
  patch: Buffer,
  maskCrop: Buffer,
  box: PixelBox,
): Promise<Buffer> {
  // Force patch + mask to exact box dims so joinChannel dimensions agree regardless of
  // what the provider returned.
  const patchRGB = await sharp(patch)
    .removeAlpha()
    .resize(box.w, box.h, { fit: 'fill' })
    .raw()
    .toBuffer();
  const maskAlpha = await sharp(maskCrop)
    .greyscale()
    .resize(box.w, box.h, { fit: 'fill' })
    .raw()
    .toBuffer();

  const patchRGBA = await sharp(patchRGB, { raw: { width: box.w, height: box.h, channels: 3 } })
    .joinChannel(maskAlpha, { raw: { width: box.w, height: box.h, channels: 1 } })
    .png()
    .toBuffer();

  // keepMetadata: carry the source's ICC profile / EXIF / density through the composite
  // instead of letting sharp silently drop them (color shift, lost DPI) — VHE-ISSUE-LOG-0021.
  // NOTE: this preserves metadata; it does NOT re-orient. §9.1 assumes ingest (§3) delivered
  // an orientation-normalized asset whose stored pixels match assetWidth×assetHeight (there
  // is no pending EXIF rotation). Orientation-normalization-at-ingest is flagged as a §3
  // policy item for the owner in 0021 — do not bodge rotation into the §9.1 composite.
  return sharp(original)
    .composite([{ input: patchRGBA, left: box.x, top: box.y, blend: 'over' }])
    .keepMetadata()
    .toBuffer();
}

export interface InpaintParams {
  ownerId: string;
  mask: MaskObject;
  /** Native asset resolution the mask is normalized against. */
  assetWidth: number;
  assetHeight: number;
  sourceImageKey: string;
  userInstruction: string;
  autoContext?: string;
  userNegative?: string;
  seed?: number;
  /** Optional provider reference images carried through §7 routing unchanged. */
  referenceImageKeys?: string[];
  /** 2–4; clamped. Default 3. */
  candidateCount?: number;
  /** Per-side bbox grow fraction. Default 0.25 (§9.1 "25% margin"). */
  marginFrac?: number;
  /**
   * Provider max dims to size-clamp the crop to (§9.1 "clamped to provider maxWidth/Height").
   * The worker resolves this from the owner's connections via `resolveInpaintProviderLimit`.
   * When omitted, the crop is submitted unclamped (pure unit tests, or no size constraint).
   */
  providerLimit?: ProviderLimit;
}

export interface InpaintDeps {
  /** key → image bytes. */
  loadImage: (key: string) => Promise<Buffer>;
  /** image bytes → key. `hint` is a human-readable role (e.g. 'crop', 'candidate'). */
  storeImage: (buf: Buffer, hint: string) => Promise<string>;
  /** Injected §7 orchestration (registry.runGeneration by default at the call site). */
  runGeneration: (
    ownerId: string,
    req: GenRequest,
    opts?: RunGenerationOpts,
  ) => Promise<RunGenerationResult>;
  runGenerationOpts?: RunGenerationOpts;
}

export interface InpaintCandidate {
  /** Full-frame result: original with the repaired crop composited under the mask. */
  compositedKey: string;
  /** The raw provider patch (crop-sized), kept for lineage/debugging. */
  rawPatchKey: string;
}

export interface InpaintOutcome {
  /** The untouched source (before). Pixels never destroyed (§9.1). */
  beforeKey: string;
  /** One composited full-frame per provider candidate (after). */
  candidates: InpaintCandidate[];
  /** The 2–4 count requested from the provider; `candidates.length` is what actually came back. */
  requestedCandidateCount: number;
  providerId: string;
  providerSlug: string;
  costCents: number;
  /** The GenRequest that was routed, for lineage. */
  request: GenRequest;
  /** The crop rectangle used (in native px). */
  box: PixelBox;
}

/**
 * §9.1 image-inpaint pipeline: rasterize + crop → route image.inpaint (§7) → composite
 * each candidate behind the feathered mask → return before/after. Non-destructive: the
 * source is only read. The §11 "apply" node is intentionally NOT written here (§11 not
 * built — see the module header and 0020).
 */
export async function runImageInpaint(
  params: InpaintParams,
  deps: InpaintDeps,
): Promise<InpaintOutcome> {
  const { assetWidth: W, assetHeight: H } = params;

  // — Precondition guards. These are caller bugs, not §4.3 job-runtime errors, so they
  //   throw a plain Error (the §4.3 taxonomy is a closed set with no BAD_REQUEST — 0021). —
  if (!params.userInstruction || params.userInstruction.trim() === '') {
    throw new Error('runImageInpaint: userInstruction must be a non-empty string');
  }
  if (!Number.isInteger(W) || W <= 0 || !Number.isInteger(H) || H <= 0) {
    throw new Error(`runImageInpaint: assetWidth/assetHeight must be positive integers (got ${W}x${H})`);
  }
  const marginFrac = params.marginFrac ?? 0.25;
  if (!Number.isFinite(marginFrac) || marginFrac < 0) {
    throw new Error(`runImageInpaint: marginFrac must be finite and >= 0 (got ${marginFrac})`);
  }

  const original = await deps.loadImage(params.sourceImageKey);
  const maskFull = await rasterizeMask(params.mask, W, H); // §5, feathered
  // Feather-aware crop: pass featherPx so the box contains the blurred mask's reach (0021).
  const box = maskBoundingBoxPx(params.mask, W, H, marginFrac, params.mask.featherPx);

  const cropSource = await cropToBox(original, box);
  const cropMask = await cropToBox(maskFull, box); // full-res, feather intact — used to composite

  // §9.1 "clamped to provider maxWidth/Height": if the crop exceeds the provider limit,
  // submit a proportionally downscaled crop+mask; the patch is composited back at full crop
  // resolution (compositeUnderMask resizes it to the box), so only the SENT size shrinks.
  let submitSource = cropSource;
  let submitMask = cropMask;
  let submitW = box.w;
  let submitH = box.h;
  if (params.providerLimit) {
    const fit = fitBoxToProviderLimit(box, params.providerLimit);
    if (fit.scale < 1) {
      submitW = fit.submitW;
      submitH = fit.submitH;
      submitSource = await sharp(cropSource).resize(submitW, submitH, { fit: 'fill' }).png().toBuffer();
      submitMask = await sharp(cropMask).resize(submitW, submitH, { fit: 'fill' }).png().toBuffer();
    }
  }

  const cropSourceKey = await deps.storeImage(submitSource, 'inpaint-crop-src');
  const cropMaskKey = await deps.storeImage(submitMask, 'inpaint-crop-mask');

  const { prompt, negativePrompt } = compileInpaintPrompt(params);
  const candidateCount = clampCandidateCount(params.candidateCount);

  const request: GenRequest = {
    capability: 'image.inpaint',
    prompt,
    negativePrompt,
    seed: params.seed,
    width: submitW,
    height: submitH,
    sourceImageKey: cropSourceKey,
    maskKey: cropMaskKey,
    referenceImageKeys: params.referenceImageKeys,
    extra: { candidateCount },
  };

  const gen = await deps.runGeneration(params.ownerId, request, deps.runGenerationOpts);
  const result: GenResult = gen.result;

  // §9.1 requests 2–4 candidates. A provider that returns none is a failed op, not a silent
  // success (0021): the adapter may ignore `extra.candidateCount`, so we validate the actual
  // result. We composite however many (≥1) came back and report the honest count via
  // candidates.length + requestedCandidateCount.
  const patchKeys = Array.isArray(result.assetKeys) ? result.assetKeys : [];
  if (patchKeys.length === 0) {
    throw new ApiError('PROVIDER_REJECTED', 422, 'provider returned zero inpaint candidates');
  }

  const candidates: InpaintCandidate[] = [];
  for (const patchKey of patchKeys) {
    const patch = await deps.loadImage(patchKey);
    const composited = await compositeUnderMask(original, patch, cropMask, box);
    const compositedKey = await deps.storeImage(composited, 'inpaint-candidate');
    candidates.push({ compositedKey, rawPatchKey: patchKey });
  }

  return {
    beforeKey: params.sourceImageKey,
    candidates,
    requestedCandidateCount: candidateCount,
    providerId: gen.connectionId,
    providerSlug: gen.providerSlug,
    costCents: gen.costCents,
    request,
    box,
  };
}
