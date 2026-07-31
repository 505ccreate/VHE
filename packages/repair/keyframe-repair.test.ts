/**
 * VHE-2 §9.2 — content-replacement keyframe orchestration, NO-SPEND (mock runGeneration).
 *
 * Verifies the orchestration contract: the GLOBAL keyframe set is computed once and every key is
 * routed through §9.1 image.inpaint with the ONE fixed seed; candidate[0] is selected
 * deterministically; the repaired keyframes are full asset-sized frames; cost sums; and the run is
 * reproducible. No provider, no network, no cent spent.
 */

import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { MaskObject } from '../masks/masks.ts';
import type { InpaintDeps } from './inpaint.ts';
import type { RunGenerationResult } from '../providers/registry.ts';
import { keyframeSet } from './video-repair.ts';
import { runKeyframeContentReplacement } from './keyframe-repair.ts';

const solid = (w: number, h: number, c = { r: 30, g: 60, b: 90 }): Promise<Buffer> =>
  sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

/** In-memory InpaintDeps whose mock runGeneration returns candidateCount asset-keyed patches. */
function mockDeps() {
  const map = new Map<string, Buffer>();
  let n = 0;
  const storeImage = async (buf: Buffer, hint: string): Promise<string> => {
    const k = `mem/${hint}/${n++}`;
    map.set(k, buf);
    return k;
  };
  const loadImage = async (key: string): Promise<Buffer> => {
    const b = map.get(key);
    if (!b) throw new Error(`no key ${key}`);
    return b;
  };
  const genCalls: {
    seed: number | undefined;
    referenceImageKeys: string[] | undefined;
    candidateCount: unknown;
    width: number;
    height: number;
    prompt: string;
  }[] = [];
  const runGeneration = vi.fn(async (_ownerId: string, req: any): Promise<RunGenerationResult> => {
    genCalls.push({
      seed: req.seed,
      referenceImageKeys: req.referenceImageKeys,
      candidateCount: req.extra?.candidateCount,
      width: req.width,
      height: req.height,
      prompt: req.prompt,
    });
    const count = Math.max(1, Number(req.extra?.candidateCount) || 1);
    const assetKeys: string[] = [];
    for (let i = 0; i < count; i++) {
      const patch = await sharp({ create: { width: req.width, height: req.height, channels: 3, background: { r: i * 20, g: 120, b: 0 } } }).png().toBuffer();
      assetKeys.push(await storeImage(patch, 'patch'));
    }
    return {
      connectionId: 'conn-fal-1',
      providerSlug: 'fal',
      result: { assetKeys },
      costCents: 7,
      cost: {} as any,
    };
  });
  return { deps: { loadImage, storeImage, runGeneration } as InpaintDeps, map, genCalls, runGeneration };
}

const rectMask = (id: string): MaskObject =>
  MaskObject.parse({
    id,
    assetId: 'clip',
    featherPx: 2,
    shapes: [{ t: 'rect', x: 0.25, y: 0.25, w: 0.4, h: 0.4 }],
    keyFrame: null,
    frameRange: null,
  });

async function seedFrames(map: Map<string, Buffer>, keys: number[], W: number, H: number): Promise<Map<number, string>> {
  const frameKeys = new Map<number, string>();
  for (const f of keys) {
    const key = `frame/${f}`;
    map.set(key, await solid(W, H));
    frameKeys.set(f, key);
  }
  return frameKeys;
}

describe('§9.2 keyframe content-replacement orchestration', () => {
  const W = 128;
  const H = 96;

  it('routes every global keyframe through image.inpaint with the one fixed seed', async () => {
    const { deps, map, genCalls } = mockDeps();
    const range = { a: 10, b: 30 };
    const keys = keyframeSet(range.a, range.b, 4); // 10,14,18,22,26,30
    const frameKeys = await seedFrames(map, keys, W, H);

    const out = await runKeyframeContentReplacement(
      {
        ownerId: 'owner',
        range,
        stride: 4,
        assetWidth: W,
        assetHeight: H,
        seed: 12345,
        sharedReferenceImageKey: 'reference/shared-hand.png',
        userInstruction: 'remove the extra finger, restore a natural hand',
        candidateCount: 2,
        frameKeyFor: (f) => frameKeys.get(f)!,
        maskFor: (f) => rectMask(`m-${f}`),
      },
      deps,
    );

    expect(out.keys).toEqual(keys);
    expect(out.keyframes.map((k) => k.frame)).toEqual(keys); // one per key, ascending
    expect(out.seed).toBe(12345);
    // exactly one inpaint per keyframe, and EVERY call carried the one global seed
    expect(genCalls).toHaveLength(keys.length);
    expect(genCalls.every((c) => c.seed === 12345)).toBe(true);
    expect(genCalls.every((c) => c.referenceImageKeys?.[0] === 'reference/shared-hand.png')).toBe(true);
    expect(genCalls.every((c) => c.candidateCount === 2)).toBe(true);
    // cost sums across keys
    expect(out.totalCostCents).toBe(keys.length * 7);
    // each repaired keyframe is a full asset-sized frame, present in the store
    for (const kf of out.keyframes) {
      const buf = map.get(kf.compositedKey);
      expect(buf).toBeDefined();
      const meta = await sharp(buf!).metadata();
      expect(meta.width).toBe(W);
      expect(meta.height).toBe(H);
      expect(kf.providerSlug).toBe('fal');
    }
  });

  it('is reproducible: identical params produce identical keys and per-key requests', async () => {
    const range = { a: 0, b: 12 };
    const keys = keyframeSet(range.a, range.b, 4);
    const run = async () => {
      const { deps, map, genCalls } = mockDeps();
      const frameKeys = await seedFrames(map, keys, W, H);
      const out = await runKeyframeContentReplacement(
        {
          ownerId: 'o', range, assetWidth: W, assetHeight: H, seed: 99,
          sharedReferenceImageKey: 'reference/stable.png',
          userInstruction: 'fix it', frameKeyFor: (f) => frameKeys.get(f)!, maskFor: (f) => rectMask(`m-${f}`),
        },
        deps,
      );
      return { keys: out.keys, prompts: genCalls.map((c) => c.prompt), seeds: genCalls.map((c) => c.seed) };
    };
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
  });

  it('handles a single-frame range (a===b) as one keyframe', async () => {
    const { deps, map } = mockDeps();
    const frameKeys = await seedFrames(map, [7], W, H);
    const out = await runKeyframeContentReplacement(
      {
        ownerId: 'o', range: { a: 7, b: 7 }, assetWidth: W, assetHeight: H, seed: 1,
        sharedReferenceImageKey: 'reference/stable.png',
        userInstruction: 'x', frameKeyFor: (f) => frameKeys.get(f)!, maskFor: (f) => rectMask(`m-${f}`),
      },
      deps,
    );
    expect(out.keys).toEqual([7]);
    expect(out.keyframes).toHaveLength(1);
    expect(out.keyframes[0]!.frame).toBe(7);
  });

  it('rejects a non-integer seed (determinism guard)', async () => {
    const { deps } = mockDeps();
    await expect(
      runKeyframeContentReplacement(
        {
          ownerId: 'o', range: { a: 0, b: 4 }, assetWidth: W, assetHeight: H, seed: 1.5,
          sharedReferenceImageKey: 'reference/stable.png',
          userInstruction: 'x', frameKeyFor: () => 'k', maskFor: (f) => rectMask(`m-${f}`),
        },
        deps,
      ),
    ).rejects.toThrow(/seed must be an integer/);
  });

  it('rejects a missing shared reference before any provider call', async () => {
    const { deps, runGeneration } = mockDeps();
    await expect(
      runKeyframeContentReplacement(
        {
          ownerId: 'o',
          range: { a: 0, b: 4 },
          assetWidth: W,
          assetHeight: H,
          seed: 1,
          sharedReferenceImageKey: '',
          userInstruction: 'x',
          frameKeyFor: () => 'k',
          maskFor: (f) => rectMask(`m-${f}`),
        },
        deps,
      ),
    ).rejects.toThrow(/sharedReferenceImageKey is required/);
    expect(runGeneration).not.toHaveBeenCalled();
  });
});
