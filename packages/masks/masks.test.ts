/**
 * VHE-2 §5 exit gate: the same MaskObject rasterized at 1280×720 and 1920×1080
 * selects the same image region (IoU ≥ 0.99 after downscale-compare).
 *
 * Method: rasterize at both resolutions (featherPx=0 so the boundary is crisp and
 * the IoU is a pure geometry check — feathering would blur the edge identically at
 * both scales but adds threshold noise). Downscale the 1080p mask to 1280×720,
 * threshold both at 127, and compute intersection/union over the white pixels.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MaskObject, rasterizeMask } from './masks.ts';

async function whiteMaskAt720(png: Buffer, srcW: number): Promise<Uint8Array> {
  // Normalize every render to 1280×720 greyscale raw for a like-for-like compare.
  const { data } = await sharp(png)
    .resize(1280, 720, { fit: 'fill', kernel: srcW === 1280 ? 'nearest' : 'lanczos3' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bits = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bits[i] = data[i]! > 127 ? 1 : 0;
  return bits;
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x & y) inter++;
    if (x | y) union++;
  }
  return union === 0 ? 1 : inter / union;
}

describe('§5 mask schema + rasterize', () => {
  it('validates a well-formed MaskObject and rejects out-of-range coords', () => {
    const ok = MaskObject.parse({
      id: 'm1', assetId: 'a1', shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
      keyFrame: null, frameRange: null,
    });
    expect(ok.mode).toBe('add'); // default applied
    expect(ok.featherPx).toBe(12); // default applied

    expect(() => MaskObject.parse({
      id: 'm2', assetId: 'a1', shapes: [{ t: 'polygon', points: [[1.4, 0], [0, 0], [0, 1]] }],
      keyFrame: null, frameRange: null,
    })).toThrow(); // 1.4 is outside the normalized [0,1] NormPoint range
  });

  it('§5 exit gate: same mask at 1280×720 and 1920×1080 → IoU ≥ 0.99', async () => {
    const mask = MaskObject.parse({
      id: 'iou', assetId: 'a1', featherPx: 0,
      shapes: [
        { t: 'rect', x: 0.10, y: 0.15, w: 0.30, h: 0.40 },
        { t: 'polygon', points: [[0.55, 0.20], [0.85, 0.25], [0.75, 0.70], [0.50, 0.60]] },
        { t: 'stroke', points: [[0.20, 0.80], [0.60, 0.85], [0.80, 0.75]], radius: 0.02 },
      ],
      keyFrame: null, frameRange: null,
    });

    const at720 = await whiteMaskAt720(await rasterizeMask(mask, 1280, 720), 1280);
    const at1080 = await whiteMaskAt720(await rasterizeMask(mask, 1920, 1080), 1920);

    const score = iou(at720, at1080);
    expect(score).toBeGreaterThanOrEqual(0.99);
  }, 60_000);
});
