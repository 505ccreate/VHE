/**
 * VHE-2 §9.1 — Image inpaint core.
 *
 * §9.1 states no exit gate of its own (confirmed against the .docx), so this verifies
 * the pipeline's described behavior directly, deterministically, with sharp on synthetic
 * pixel buffers + an injected mock provider — the same shape as the §7 exit-gate test
 * (mock adapter, injected deps, no network). Layers:
 *   - bbox geometry (union + 25% margin + frame clamp + stroke radius)
 *   - prompt compilation (verbatim template, user-first precedence, optional auto-context)
 *   - candidate clamp (2–4)
 *   - composite-under-mask pixels (§9.2 rule on a still: green inside mask, original out)
 *   - runImageInpaint end-to-end: crop → mock route → composite each candidate → before/after
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MaskObject, rasterizeMask } from '../masks/masks.ts';
import type { GenRequest } from '../providers/types.ts';
import type { RunGenerationResult } from '../providers/registry.ts';
import type { ProviderConnection } from '../providers/routing.ts';
import {
  INPAINT_NEGATIVE_DEFAULT,
  INPAINT_NEGATIVE_TERMS,
  INPAINT_TEMPLATE_SUFFIX,
  clampCandidateCount,
  compileInpaintPrompt,
  compositeUnderMask,
  conflictingNegativeTerms,
  cropToBox,
  fitBoxToProviderLimit,
  maskBoundingBoxPx,
  resolveInpaintProviderLimit,
  runImageInpaint,
} from './inpaint.ts';

const RED = { r: 255, g: 0, b: 0 };
const GREEN = { r: 0, g: 255, b: 0 };

function solid(w: number, h: number, c: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
}

/** Read one pixel as [r,g,b] (alpha stripped for a stable 3-channel compare). */
async function pixel(buf: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const raw = await sharp(buf).removeAlpha().extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return [raw[0]!, raw[1]!, raw[2]!];
}

describe('§9.1 maskBoundingBoxPx', () => {
  it('unions shapes, grows by 25% per side, clamps to the frame', () => {
    const m = MaskObject.parse({
      id: 'b', assetId: 'a', featherPx: 0,
      shapes: [{ t: 'rect', x: 0.25, y: 0.25, w: 0.5, h: 0.5 }],
      keyFrame: null, frameRange: null,
    });
    // tight box = [250,250]..[750,750] (500×500); +25% per side = +125 each way.
    const box = maskBoundingBoxPx(m, 1000, 1000, 0.25);
    expect(box).toEqual({ x: 125, y: 125, w: 750, h: 750 });
  });

  it('clamps the grown box to the image bounds', () => {
    const m = MaskObject.parse({
      id: 'edge', assetId: 'a', featherPx: 0,
      shapes: [{ t: 'rect', x: 0.9, y: 0.9, w: 0.1, h: 0.1 }], // touches the bottom-right corner
      keyFrame: null, frameRange: null,
    });
    const box = maskBoundingBoxPx(m, 1000, 1000, 0.25);
    expect(box.x + box.w).toBe(1000); // never exceeds W
    expect(box.y + box.h).toBe(1000); // never exceeds H
    expect(box.x).toBeGreaterThanOrEqual(0);
  });

  it('includes a stroke radius (normalized to width) in the extent', () => {
    // §5 requires ≥2 stroke points; use two coincident points to isolate the radius.
    const m2 = MaskObject.parse({
      id: 's2', assetId: 'a', featherPx: 0,
      shapes: [{ t: 'stroke', points: [[0.5, 0.5], [0.5, 0.5]], radius: 0.1 }],
      keyFrame: null, frameRange: null,
    });
    const box = maskBoundingBoxPx(m2, 1000, 1000, 0); // no margin, isolate the radius
    // radius 0.1*1000 = 100px around (500,500) → [400,400]..[600,600]
    expect(box).toEqual({ x: 400, y: 400, w: 200, h: 200 });
  });
});

describe('§9.1 compileInpaintPrompt', () => {
  it('leads with the user instruction and appends the verbatim template', () => {
    const { prompt, negativePrompt } = compileInpaintPrompt({ userInstruction: 'remove the extra thumb' });
    expect(prompt).toBe(`remove the extra thumb. ${INPAINT_TEMPLATE_SUFFIX}`);
    expect(negativePrompt).toBe(INPAINT_NEGATIVE_DEFAULT);
  });

  it('inserts optional auto-context between instruction and template', () => {
    const { prompt } = compileInpaintPrompt({
      userInstruction: 'fix the hand',
      autoContext: 'possible hand anomaly, frames 141-167',
    });
    expect(prompt).toBe(
      `fix the hand. possible hand anomaly, frames 141-167. ${INPAINT_TEMPLATE_SUFFIX}`,
    );
  });

  it('puts user negatives ahead of the template default (user outranks)', () => {
    const { negativePrompt } = compileInpaintPrompt({
      userInstruction: 'x',
      userNegative: 'no jewelry',
    });
    expect(negativePrompt).toBe(`no jewelry, ${INPAINT_NEGATIVE_DEFAULT}`);
    expect(negativePrompt.indexOf('no jewelry')).toBeLessThan(negativePrompt.indexOf('extra fingers'));
  });
});

describe('§9.1 clampCandidateCount', () => {
  it('defaults to 3 and clamps to the 2–4 band', () => {
    expect(clampCandidateCount(undefined)).toBe(3);
    expect(clampCandidateCount(1)).toBe(2);
    expect(clampCandidateCount(5)).toBe(4);
    expect(clampCandidateCount(3)).toBe(3);
  });
});

describe('§9.1 compositeUnderMask (§9.2 rule on a still)', () => {
  it('shows the patch inside the mask and the original outside', async () => {
    const original = await solid(100, 100, RED);
    const box = { x: 30, y: 30, w: 40, h: 40 };
    const patch = await solid(box.w, box.h, GREEN);
    const maskWhite = await solid(box.w, box.h, { r: 255, g: 255, b: 255 }); // whole crop = edit region

    const out = await compositeUnderMask(original, patch, maskWhite, box);
    expect(await pixel(out, 50, 50)).toEqual([0, 255, 0]); // inside the box+mask → patch (green)
    expect(await pixel(out, 5, 5)).toEqual([255, 0, 0]); // outside the box → original (red)
  });

  it('leaves original pixels that fall inside the box but outside the mask', async () => {
    const original = await solid(100, 100, RED);
    const box = { x: 20, y: 20, w: 60, h: 60 };
    const patch = await solid(box.w, box.h, GREEN);
    // mask crop: black with a white 20×20 rect at its center (crop-local 20,20..40,40)
    const maskCrop = await sharp({ create: { width: box.w, height: box.h, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{
        input: await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer(),
        left: 20, top: 20,
      }])
      .png().toBuffer();

    const out = await compositeUnderMask(original, patch, maskCrop, box);
    // frame (50,50) = crop-local (30,30) → inside the white rect → green
    expect(await pixel(out, 50, 50)).toEqual([0, 255, 0]);
    // frame (25,25) = crop-local (5,5) → inside the box but mask is black → original red
    expect(await pixel(out, 25, 25)).toEqual([255, 0, 0]);
  });
});

describe('§9.1 runImageInpaint end-to-end (injected storage + mock provider)', () => {
  it('crops, routes image.inpaint, composites each candidate, returns before/after', async () => {
    const store = new Map<string, Buffer>();
    const loadImage = async (key: string) => {
      const b = store.get(key);
      if (!b) throw new Error(`no such key ${key}`);
      return b;
    };
    let n = 0;
    const storeImage = async (buf: Buffer, hint: string) => {
      const key = `mem/${hint}/${n++}`;
      store.set(key, buf);
      return key;
    };

    // A 200×200 red source with a centered mask.
    store.set('src.png', await solid(200, 200, RED));
    const mask = MaskObject.parse({
      id: 'm', assetId: 'a', featherPx: 0,
      shapes: [{ t: 'rect', x: 0.4, y: 0.4, w: 0.2, h: 0.2 }], // [80,80]..[120,120]
      keyFrame: null, frameRange: null,
    });

    let seenReq: GenRequest | undefined;
    const runGeneration = async (
      _owner: string,
      req: GenRequest,
    ): Promise<RunGenerationResult> => {
      seenReq = req;
      // Provider returns 2 green "repaired" patches sized to the crop.
      const keys: string[] = [];
      for (let i = 0; i < 2; i++) {
        const k = `prov/patch/${i}`;
        store.set(k, await solid(req.width, req.height, GREEN));
        keys.push(k);
      }
      return {
        connectionId: 'conn-xyz',
        providerSlug: 'mock-inpaint',
        result: { assetKeys: keys, costCents: 9 },
        costCents: 9,
      };
    };

    const out = await runImageInpaint(
      {
        ownerId: 'owner-1',
        mask,
        assetWidth: 200,
        assetHeight: 200,
        sourceImageKey: 'src.png',
        userInstruction: 'repair the smear',
        candidateCount: 2,
      },
      { loadImage, storeImage, runGeneration },
    );

    // routed as image.inpaint with the compiled prompt + crop dims
    expect(seenReq?.capability).toBe('image.inpaint');
    expect(seenReq?.prompt).toContain('repair the smear');
    expect(seenReq?.prompt).toContain(INPAINT_TEMPLATE_SUFFIX);
    expect(seenReq?.negativePrompt).toBe(INPAINT_NEGATIVE_DEFAULT);
    expect(seenReq?.extra).toEqual({ candidateCount: 2 });

    // before/after
    expect(out.beforeKey).toBe('src.png'); // source untouched (non-destructive)
    expect(out.providerId).toBe('conn-xyz');
    expect(out.costCents).toBe(9);
    expect(out.candidates).toHaveLength(2);

    // each composited full-frame: green inside the mask, red outside
    for (const cand of out.candidates) {
      const composited = store.get(cand.compositedKey)!;
      expect(await pixel(composited, 100, 100)).toEqual([0, 255, 0]); // mask center → repaired
      expect(await pixel(composited, 10, 10)).toEqual([255, 0, 0]); // outside mask → original
    }
  }, 30_000);
});

// ── VHE-ISSUE-LOG-0021 hardening (Eli §9.1 review) ────────────────────────────

describe('§9.1 feather containment in the crop box (0021 #1)', () => {
  it('grows the crop box so the feather is fully inside it (no clipped seam)', async () => {
    // 40px mask + featherPx 20 (blur sigma 10, reach ≈30px) on a 400×400 frame.
    const m = MaskObject.parse({
      id: 'f', assetId: 'a', featherPx: 20,
      shapes: [{ t: 'rect', x: 0.5, y: 0.5, w: 0.1, h: 0.1 }], // [200,200]..[240,240]
      keyFrame: null, frameRange: null,
    });
    const box = maskBoundingBoxPx(m, 400, 400, 0.25, m.featherPx);
    const boxNoFeather = maskBoundingBoxPx(m, 400, 400, 0.25, 0);

    // Feather adds a per-side pad on top of the 25% margin — the crop must be clearly larger.
    expect(box.w).toBeGreaterThan(100);
    expect(box.w - boxNoFeather.w).toBeGreaterThanOrEqual(50);

    // Crop the FULL feathered raster to the box: borders must be ~black (feather contained) —
    // a clipped feather would leave a bright hard edge at the crop border.
    const maskFull = await rasterizeMask(m, 400, 400);
    const cropMask = await cropToBox(maskFull, box);
    const cornerTL = await pixel(cropMask, 0, 0);
    const topMid = await pixel(cropMask, Math.floor(box.w / 2), 0);
    const leftMid = await pixel(cropMask, 0, Math.floor(box.h / 2));
    expect(cornerTL[0]).toBeLessThan(20);
    expect(topMid[0]).toBeLessThan(20);
    expect(leftMid[0]).toBeLessThan(20);

    // The center is still clearly the (bright) edit region — the crop didn't swallow the mask.
    const center = await pixel(cropMask, Math.floor(box.w / 2), Math.floor(box.h / 2));
    expect(center[0]).toBeGreaterThan(150);
  });
});

describe('§9.1 fitBoxToProviderLimit (0021 #2)', () => {
  it('proportionally downscales an oversized crop to the provider max', () => {
    const fit = fitBoxToProviderLimit({ x: 0, y: 0, w: 8000, h: 6000 }, { maxWidth: 2048, maxHeight: 2048 });
    expect(fit.submitW).toBeLessThanOrEqual(2048);
    expect(fit.submitH).toBeLessThanOrEqual(2048);
    expect(fit.scale).toBeCloseTo(2048 / 8000, 5);
    // aspect ratio preserved (8000/6000 = 1.333…)
    expect(fit.submitW / fit.submitH).toBeCloseTo(8000 / 6000, 2);
  });

  it('leaves a within-limit crop unchanged (never upscales)', () => {
    const fit = fitBoxToProviderLimit({ x: 0, y: 0, w: 2000, h: 1500 }, { maxWidth: 4096, maxHeight: 4096 });
    expect(fit).toEqual({ submitW: 2000, submitH: 1500, scale: 1 });
  });
});

describe('§9.1 resolveInpaintProviderLimit (0021 #2)', () => {
  const conn = (slug: string, cap?: { maxWidth: number; maxHeight: number; supportsMask: boolean }): ProviderConnection => ({
    id: `id-${slug}`, providerSlug: slug, isDefaultFor: [],
    manifest: {
      providerSlug: slug,
      capabilities: cap
        ? { 'image.inpaint': { ...cap, supportsSeed: true, supportsNegativePrompt: true, supportsReferenceImages: 0 } }
        : {},
    },
  });

  it('returns the largest max dims among mask-capable image.inpaint connections', () => {
    const limit = resolveInpaintProviderLimit([
      conn('small', { maxWidth: 2048, maxHeight: 2048, supportsMask: true }),
      conn('big', { maxWidth: 4096, maxHeight: 3000, supportsMask: true }),
      conn('nomask', { maxWidth: 8000, maxHeight: 8000, supportsMask: false }), // ignored
      conn('nocap'), // no image.inpaint → ignored
    ]);
    expect(limit).toEqual({ maxWidth: 4096, maxHeight: 3000 });
  });

  it('returns undefined when no eligible connection exists', () => {
    expect(resolveInpaintProviderLimit([conn('nocap')])).toBeUndefined();
    expect(resolveInpaintProviderLimit([])).toBeUndefined();
  });
});

describe('§9.1 prompt-conflict subtraction (0021 #5)', () => {
  it('drops only the conflicting default-negative term the user asked to keep', () => {
    const { negativePrompt } = compileInpaintPrompt({ userInstruction: 'keep the watermark in the corner' });
    expect(negativePrompt).not.toContain('watermark');
    expect(negativePrompt).toContain('extra fingers'); // the rest of the defaults survive
    expect(conflictingNegativeTerms('keep the watermark in the corner')).toEqual(['watermark']);
  });

  it('drops text artifacts when the user wants to add text', () => {
    const { negativePrompt } = compileInpaintPrompt({ userInstruction: 'add a text caption at the bottom' });
    expect(negativePrompt).not.toContain('text artifacts');
    expect(negativePrompt).toContain('watermark');
  });

  it('leaves the full default in place for an ordinary repair (no preserve intent)', () => {
    const { negativePrompt } = compileInpaintPrompt({ userInstruction: 'fix the hand' });
    expect(negativePrompt).toBe(INPAINT_NEGATIVE_DEFAULT);
    expect(conflictingNegativeTerms('fix the hand')).toEqual([]);
  });

  it('keeps a user negative ahead of the (possibly reduced) defaults', () => {
    const { negativePrompt } = compileInpaintPrompt({
      userInstruction: 'keep the watermark',
      userNegative: 'no jewelry',
    });
    expect(negativePrompt.startsWith('no jewelry, ')).toBe(true);
    expect(negativePrompt).not.toContain('watermark');
    // exactly the 6 surviving defaults follow the user negative
    expect(negativePrompt).toBe(`no jewelry, ${INPAINT_NEGATIVE_TERMS.filter((t) => t !== 'watermark').join(', ')}`);
  });
});

describe('§9.1 runImageInpaint hardening (0021 #2/#3/#4)', () => {
  function memStore() {
    const store = new Map<string, Buffer>();
    const loadImage = async (key: string) => {
      const b = store.get(key);
      if (!b) throw new Error(`no such key ${key}`);
      return b;
    };
    let n = 0;
    const storeImage = async (buf: Buffer, hint: string) => {
      const key = `mem/${hint}/${n++}`;
      store.set(key, buf);
      return key;
    };
    return { store, loadImage, storeImage };
  }

  const mask = MaskObject.parse({
    id: 'm', assetId: 'a', featherPx: 0,
    shapes: [{ t: 'rect', x: 0.2, y: 0.2, w: 0.6, h: 0.6 }], // large crop [40,40]..[160,160]
    keyFrame: null, frameRange: null,
  });

  it('downscales the submitted crop to the provider limit, still composites full-frame (#2)', async () => {
    const { store, loadImage, storeImage } = memStore();
    store.set('src.png', await solid(200, 200, RED));

    let seenReq: GenRequest | undefined;
    const runGeneration = async (_o: string, req: GenRequest): Promise<RunGenerationResult> => {
      seenReq = req;
      store.set('patch', await solid(req.width, req.height, GREEN));
      return { connectionId: 'c', providerSlug: 'mock', result: { assetKeys: ['patch'], costCents: 1 }, costCents: 1 };
    };

    const out = await runImageInpaint(
      { ownerId: 'o', mask, assetWidth: 200, assetHeight: 200, sourceImageKey: 'src.png',
        userInstruction: 'repair', candidateCount: 2, providerLimit: { maxWidth: 64, maxHeight: 64 } },
      { loadImage, storeImage, runGeneration },
    );

    // crop was ~120px but the SENT request is clamped to ≤64px…
    expect(seenReq!.width).toBeLessThanOrEqual(64);
    expect(seenReq!.height).toBeLessThanOrEqual(64);
    // …while the composited result is still the full 200×200 frame, repaired under the mask.
    const composited = store.get(out.candidates[0]!.compositedKey)!;
    const meta = await sharp(composited).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
    expect(await pixel(composited, 100, 100)).toEqual([0, 255, 0]); // inside mask → repaired
    expect(await pixel(composited, 5, 5)).toEqual([255, 0, 0]); // outside mask → original
  }, 30_000);

  it('rejects a provider result with zero candidates (#3)', async () => {
    const { store, loadImage, storeImage } = memStore();
    store.set('src.png', await solid(200, 200, RED));
    const runGeneration = async (): Promise<RunGenerationResult> => ({
      connectionId: 'c', providerSlug: 'mock', result: { assetKeys: [], costCents: 0 }, costCents: 0,
    });
    await expect(
      runImageInpaint(
        { ownerId: 'o', mask, assetWidth: 200, assetHeight: 200, sourceImageKey: 'src.png', userInstruction: 'repair' },
        { loadImage, storeImage, runGeneration },
      ),
    ).rejects.toThrow(/zero inpaint candidates/);
  });

  it('reports the requested candidate count on the outcome (#3)', async () => {
    const { store, loadImage, storeImage } = memStore();
    store.set('src.png', await solid(200, 200, RED));
    const runGeneration = async (_o: string, req: GenRequest): Promise<RunGenerationResult> => {
      store.set('p0', await solid(req.width, req.height, GREEN));
      return { connectionId: 'c', providerSlug: 'mock', result: { assetKeys: ['p0'], costCents: 1 }, costCents: 1 };
    };
    const out = await runImageInpaint(
      { ownerId: 'o', mask, assetWidth: 200, assetHeight: 200, sourceImageKey: 'src.png',
        userInstruction: 'repair', candidateCount: 4 },
      { loadImage, storeImage, runGeneration },
    );
    expect(out.requestedCandidateCount).toBe(4);
    expect(out.candidates).toHaveLength(1); // honest: only one actually came back
  });

  it('rejects invalid inputs before touching storage or the provider (#4)', async () => {
    const throwingDeps = {
      loadImage: async () => { throw new Error('loadImage must not be called'); },
      storeImage: async () => { throw new Error('storeImage must not be called'); },
      runGeneration: async () => { throw new Error('runGeneration must not be called'); },
    } as unknown as Parameters<typeof runImageInpaint>[1];
    const base = { ownerId: 'o', mask, assetWidth: 200, assetHeight: 200, sourceImageKey: 'src.png' };

    await expect(runImageInpaint({ ...base, userInstruction: '   ' }, throwingDeps)).rejects.toThrow(/non-empty/);
    await expect(runImageInpaint({ ...base, userInstruction: 'x', assetWidth: 0 }, throwingDeps)).rejects.toThrow(/positive integers/);
    await expect(runImageInpaint({ ...base, userInstruction: 'x', marginFrac: -1 }, throwingDeps)).rejects.toThrow(/finite/);
    await expect(runImageInpaint({ ...base, userInstruction: 'x', marginFrac: Infinity }, throwingDeps)).rejects.toThrow(/finite/);
  });
});
