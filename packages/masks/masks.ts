/**
 * VHE-2 §5 — Mask Format (one schema for every gesture). Vector-first, normalized
 * coordinates, rasterize only when a job needs pixels.
 *
 * Copied from §5 of VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx with the
 * VHE-ISSUE-LOG-0012 de-autocorrect mapping AND the token reconstructions the
 * .docx destroyed (VHE-ISSUE-LOG-0016). The .docx dropped these tokens from its
 * own code — the verbatim source does not compile — and each is forced
 * unambiguously by the surrounding code / the §5 exit gate:
 *   1. `z.infer<typeof MaskObject>` — the .docx has bare `z.infer` (generic dropped).
 *   2. `Promise<Buffer>` — the .docx has bare `Promise` (generic dropped).
 *   3. Backticks around the `px` template `` `${x * W},${y * H}` `` — dropped.
 *   4. The opening `<svg xmlns=… width height>` root element — dropped; required
 *      or sharp cannot rasterize at W×H and the §5 IoU gate is untestable.
 * No logic was changed; only tokens the format lost were restored.
 */

import { z } from 'zod';
import sharp from 'sharp';

export const NormPoint = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

export const MaskShape = z.discriminatedUnion('t', [
  z.object({ t: z.literal('rect'), x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  z.object({ t: z.literal('polygon'), points: z.array(NormPoint).min(3) }), // lasso/circle
  z.object({ t: z.literal('stroke'), points: z.array(NormPoint).min(2),
             radius: z.number().min(0).max(0.5) }),                          // brush; radius normalized to WIDTH
  z.object({ t: z.literal('points'), include: z.array(NormPoint),
             exclude: z.array(NormPoint).default([]) }),                     // smart-tap -> SAM resolves to polygon
]);

export const MaskObject = z.object({
  id: z.string(), assetId: z.string(),
  mode: z.enum(['add', 'subtract']).default('add'),
  shapes: z.array(MaskShape).min(1),
  featherPx: z.number().int().min(0).max(200).default(12), // px at NATIVE resolution
  keyFrame: z.number().int().nullable(), // video: frame user drew on
  frameRange: z.object({ start: z.number().int(), end: z.number().int() }).nullable(),
  tracked: z.boolean().default(false),
});
export type MaskObject = z.infer<typeof MaskObject>;

export async function rasterizeMask(m: MaskObject, W: number, H: number): Promise<Buffer> {
  const px = ([x, y]: [number, number]) => `${x * W},${y * H}`;
  const parts = m.shapes.map((s) => {
    switch (s.t) {
      case 'rect':    return `<rect x="${s.x * W}" y="${s.y * H}" width="${s.w * W}" height="${s.h * H}" fill="white"/>`;
      case 'polygon': return `<polygon points="${s.points.map(px).join(' ')}" fill="white"/>`;
      case 'stroke':  return `<polyline points="${s.points.map(px).join(' ')}" fill="none" stroke="white"` +
                             ` stroke-width="${s.radius * 2 * W}" stroke-linecap="round" stroke-linejoin="round"/>`;
      case 'points':  throw new Error('points-mask must be resolved by SAM before rasterize');
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="100%" height="100%" fill="black"/>${parts.join('')}</svg>`;
  let img = sharp(Buffer.from(svg)).ensureAlpha().greyscale();
  if (m.featherPx > 0) img = img.blur(m.featherPx / 2); // sigma ~ feather/2
  return img.png().toBuffer(); // white = edit region
}
