/**
 * VHE-2 §9.1 — TEMPORARY synthetic fixtures for real-provider PLUMBING validation only.
 *
 * These are NOT the owner's frozen AI-content fixtures (bad_hand.png / garbled_text.png in
 * VHE-2 §1). They are hand-built stand-ins with a known defect region + a mask, written to
 * `fixtures/_TEMP-provider-validation/` (a SUBDIR, so `scripts/preflight.ts` — which checks
 * `fixtures/<name>` at the top level — never counts them and the FAIL 4 gate stays honest).
 * They validate that a real provider call flows through §7 → §9.1 end-to-end; they do NOT
 * validate repair quality on genuine hallucination artifacts (VHE-ISSUE-LOG-0022).
 *
 * Run: node scripts/make-temp-fixtures.ts   (via the pinned node — see CURRENT-STATUS).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const OUT = resolve(import.meta.dirname, '..', 'fixtures', '_TEMP-provider-validation');
mkdirSync(OUT, { recursive: true });

const W = 1024;
const H = 1024;

/** A skin-toned hand with an obvious extra/malformed finger (the "hallucination"). */
const badHandSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#d8dde3"/>
  <rect x="330" y="520" width="360" height="300" rx="70" fill="#e8b58f"/>
  <rect x="352" y="320" width="56" height="220" rx="28" fill="#e8b58f"/>
  <rect x="422" y="300" width="56" height="240" rx="28" fill="#e8b58f"/>
  <rect x="492" y="310" width="56" height="230" rx="28" fill="#e8b58f"/>
  <rect x="562" y="330" width="56" height="210" rx="28" fill="#e8b58f"/>
  <rect x="250" y="560" width="150" height="52" rx="26" fill="#e8b58f" transform="rotate(-28 250 560)"/>
  <!-- DEFECT: a 6th, crooked, discolored finger fused to the hand -->
  <g transform="rotate(24 660 430)">
    <rect x="632" y="300" width="52" height="250" rx="26" fill="#c7a76e"/>
    <rect x="640" y="270" width="60" height="70" rx="30" fill="#b7995f"/>
    <rect x="612" y="470" width="90" height="60" rx="24" fill="#c7a76e"/>
  </g>
</svg>`;

/** A sign panel: clean strokes on the left, a garbled glyph-soup cluster on the right. */
const garbledTextSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="140" y="380" width="744" height="260" rx="20" fill="#f2efe6" stroke="#333333" stroke-width="6"/>
  <g stroke="#222222" stroke-width="10" fill="none" stroke-linecap="round">
    <path d="M190 450 h70 M225 450 v130 M300 450 v130 M300 450 h60 q30 0 30 40 t-30 40 h-60 M400 450 v130 M400 450 h60 M400 515 h50 M400 580 h60"/>
  </g>
  <!-- DEFECT: garbled, overlapping pseudo-glyphs (a "hallucinated" text region) -->
  <g stroke="#191919" stroke-width="9" fill="none" stroke-linecap="round">
    <path d="M580 470 q40 -60 60 10 t50 -20 q30 70 -20 90 M600 560 q60 -40 90 20"/>
    <path d="M700 440 l40 120 l-50 -40 l60 -10 M760 470 q-40 40 10 80 q50 30 20 -70"/>
    <path d="M820 460 v110 M800 460 h50 M810 515 h35 M560 590 q80 30 160 -10 q50 -20 100 15"/>
  </g>
</svg>`;

async function writePng(name: string, svg: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, name));
  console.log(`wrote ${name}`);
}

// Mask rects (normalized) framing each defect — the harness builds a §5 MaskObject from these.
const manifest = {
  note: 'TEMPORARY synthetic plumbing fixtures; NOT the frozen §1 fixtures. See README.md.',
  fixtures: {
    'bad_hand.png': { mask: { x: 0.55, y: 0.24, w: 0.24, h: 0.40 }, featherPx: 16 },
    'garbled_text.png': { mask: { x: 0.52, y: 0.40, w: 0.37, h: 0.20 }, featherPx: 14 },
  },
};

const readme = `# TEMPORARY provider-validation fixtures — NOT the real §1 fixtures

These synthetic images exist only to validate that a real provider (OpenAI / Gemini) call
flows through §7 routing → §9.1 image inpaint end-to-end (auth, request, response, crop,
composite). They are hand-drawn stand-ins with a known defect region, **not** genuine
AI-hallucination artifacts.

They DO prove: the pipeline plumbing works against a live paid provider.
They do NOT prove: repair quality on real hallucinations. That still requires the owner's
frozen \`bad_hand.png\` / \`garbled_text.png\` (VHE-2 §1), which remain undelivered — so the
\`pnpm preflight\` FAIL 4 gate is intentionally left red. See VHE-ISSUE-LOG-0022 / 0009 / 0011.

Regenerate: \`node scripts/make-temp-fixtures.ts\`.
`;

await writePng('bad_hand.png', badHandSvg);
await writePng('garbled_text.png', garbledTextSvg);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(join(OUT, 'README.md'), readme);
console.log(`temp fixtures written to ${OUT}`);
