/**
 * VHE-2 §9.2 — content-replacement KEYFRAME ORCHESTRATION (no-spend, deterministic).
 *
 * SCOPE (VHE-ISSUE-LOG-0027): §9.2's content-replacement path "inpaints frames a, a+s, …, b". This
 * module is exactly that stage and nothing more: it walks the GLOBAL keyframe set (computed once on
 * absolute indices by `keyframeSet`, §9.2A / §9.5) and routes EACH keyframe through the hardened
 * §9.1 `runImageInpaint` (`image.inpaint`), with the ONE fixed global seed and ONE shared reference
 * image. It reuses §9.1 wholesale so every keyframe inherits its
 * crop→feather→composite→provider-size-clamp hardening (0020/0021).
 *
 * DELIBERATELY OUT OF SCOPE (do NOT add here — owner boundary, 0027):
 *   • RIFE interpolation of the non-key frames between keys — GPU-blocked, deferred (0024). The
 *     deterministic blend parameter lives in `video-repair.ts` (`interpolationT`); driving RIFE is
 *     a hosted/GPU follow-up.
 *   • The video-REMOVAL lane (`video.inpaint` / a hosted ProPainter equivalent) — NOT selected, NOT
 *     built. This is content replacement via still inpaint of keyframes only.
 *   • Any live provider call. `runGeneration` is injected; with a mock adapter this spends nothing.
 *     The real quality gate stays OPEN until the four frozen §1 fixtures arrive.
 *
 * DETERMINISM: the key set is computed once; every keyframe is sent the SAME seed; the per-key
 * request is built identically; candidates come back and candidate[0] is selected deterministically;
 * keyframes are processed in ascending order. Given a provider that honors `seed` (e.g. fal), this
 * yields reproducible keyframe repairs. Output determinism still depends on provider seed support —
 * OpenAI/Gemini `image.inpaint` do not expose a seed (their manifests advertise `supportsSeed:false`).
 */

import type { MaskObject } from '../masks/masks.ts';
import {
  runImageInpaint,
  type InpaintDeps,
  type PixelBox,
  type ProviderLimit,
} from './inpaint.ts';
import { keyframeSet, DEFAULT_KEYFRAME_STRIDE, type RepairRange } from './video-repair.ts';

export interface KeyframeRepairParams {
  ownerId: string;
  /** Inclusive absolute frame range to repair (§9.2 [a..b]). */
  range: RepairRange;
  /** §9.2 stride s (4–6); default 4. Validated by `keyframeSet`. */
  stride?: number;
  /** Native asset resolution the per-frame masks are normalized against. */
  assetWidth: number;
  assetHeight: number;
  /**
   * The ONE fixed global seed for the whole repair (§9.5: "Seed and keys are global, not
   * per-window"). Integer required so the run is reproducible.
   */
  seed: number;
  /** One stable visual reference supplied to every keyframe (§9.2 "one fixed seed + shared reference"). */
  sharedReferenceImageKey: string;
  userInstruction: string;
  autoContext?: string;
  userNegative?: string;
  /**
   * Candidates requested per keyframe. Default 2 (the §9.1 2–4 floor). candidate[0] is selected
   * deterministically as the keyframe's repair. NOTE (0027, flagged for owner): a batch keyframe
   * repair arguably wants a SINGLE candidate per key to halve cost, but §9.1's pipeline enforces the
   * 2–4 band; revisiting a single-candidate batch mode is an owner decision, not chosen here.
   */
  candidateCount?: number;
  marginFrac?: number;
  providerLimit?: ProviderLimit;
  /**
   * Absolute keyframe index → the storage key of that FULL frame (as extracted per §6.3). Injected
   * so this module assumes no particular numbering scheme (the worker owns extraction/layout).
   */
  frameKeyFor: (absoluteFrame: number) => string;
  /**
   * Absolute keyframe index → that frame's §5 mask. Injected because per-frame masks come from SAM 2
   * tracking (§8) or its RAFT/optical-flow fallback or a static key-frame mask — the tracking method
   * is NOT chosen here (it is GPU/hosted and out of scope). A static-mask caller simply returns the
   * same mask for every key.
   */
  maskFor: (absoluteFrame: number) => MaskObject;
}

/** One repaired keyframe: the composited FULL frame (candidate[0]) plus lineage. */
export interface RepairedKeyframe {
  frame: number; // absolute index
  compositedKey: string; // repaired full keyframe (original with the inpaint composited under the mask)
  rawPatchKey: string; // the provider patch, for lineage
  box: PixelBox;
  providerId: string;
  providerSlug: string;
  costCents: number;
}

export interface KeyframeRepairOutcome {
  /** The global keyframe set (computed once, §9.2A/§9.5) — ascending, de-duplicated. */
  keys: number[];
  /** One repaired keyframe per key, in ascending order. */
  keyframes: RepairedKeyframe[];
  /** Sum of the per-keyframe reported/estimated cost. */
  totalCostCents: number;
  /** The single global seed used for every key. */
  seed: number;
}

/**
 * Route every keyframe in [a..b] through §9.1 `image.inpaint` with the one fixed global seed and
 * return the repaired full keyframes. No interpolation, no removal lane, no live spend beyond
 * whatever the injected `runGeneration` does (a mock spends nothing).
 */
export async function runKeyframeContentReplacement(
  params: KeyframeRepairParams,
  deps: InpaintDeps,
): Promise<KeyframeRepairOutcome> {
  if (!Number.isInteger(params.seed)) {
    throw new Error(`runKeyframeContentReplacement: seed must be an integer (§9.5 fixed global seed), got ${params.seed}`);
  }
  if (!params.sharedReferenceImageKey) {
    throw new Error('runKeyframeContentReplacement: sharedReferenceImageKey is required (§9.2 shared reference)');
  }
  const stride = params.stride ?? DEFAULT_KEYFRAME_STRIDE;
  // Global key set — computed ONCE on absolute indices before any key runs (§9.5 guarantee).
  const keys = keyframeSet(params.range.a, params.range.b, stride);
  const candidateCount = params.candidateCount ?? 2;

  const keyframes: RepairedKeyframe[] = [];
  let totalCostCents = 0;

  for (const frame of keys) {
    const outcome = await runImageInpaint(
      {
        ownerId: params.ownerId,
        mask: params.maskFor(frame),
        assetWidth: params.assetWidth,
        assetHeight: params.assetHeight,
        sourceImageKey: params.frameKeyFor(frame),
        userInstruction: params.userInstruction,
        autoContext: params.autoContext,
        userNegative: params.userNegative,
        seed: params.seed, // the ONE global seed for every key
        referenceImageKeys: [params.sharedReferenceImageKey],
        candidateCount,
        marginFrac: params.marginFrac,
        providerLimit: params.providerLimit,
      },
      deps,
    );
    // Deterministic selection: candidate[0]. runImageInpaint guarantees ≥1 candidate or throws
    // PROVIDER_REJECTED, so [0] is always present here.
    const chosen = outcome.candidates[0]!;
    keyframes.push({
      frame,
      compositedKey: chosen.compositedKey,
      rawPatchKey: chosen.rawPatchKey,
      box: outcome.box,
      providerId: outcome.providerId,
      providerSlug: outcome.providerSlug,
      costCents: outcome.costCents,
    });
    totalCostCents += outcome.costCents;
  }

  return { keys, keyframes, totalCostCents, seed: params.seed };
}
