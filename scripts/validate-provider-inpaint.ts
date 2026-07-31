/**
 * VHE-2 §9.1 — real-provider inpaint validation harness (PAID).
 *
 * Drives `runImageInpaint` through the REAL §7 path (registry.runGeneration → loadConnections
 * from Postgres → decrypt key → real adapter → live provider) on the temporary synthetic
 * fixtures, and writes before/after PNGs + prints the actual cost/usage per fixture. This is
 * the plumbing validation of VHE-ISSUE-LOG-0022 — NOT a repair-quality claim.
 *
 * Prereqs: `.env` has DATABASE_URL + PROVIDER_KEK_V<n>; a provider_connections row is wired
 * (scripts/wire-provider-connection.ts); temp fixtures exist (scripts/make-temp-fixtures.ts).
 *
 * Config via env: VAL_PROVIDER (openai|google), VAL_OWNER, VAL_MODEL (optional model override).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));

const provider = process.env.VAL_PROVIDER ?? 'openai';
const owner = process.env.VAL_OWNER ?? 'vhe-validation-owner';
const model = process.env.VAL_MODEL;

const FX = resolve(import.meta.dirname, '..', 'fixtures', '_TEMP-provider-validation');
const cfg = JSON.parse(readFileSync(join(FX, 'manifest.json'), 'utf8')) as {
  fixtures: Record<string, { mask: { x: number; y: number; w: number; h: number }; featherPx: number }>;
};
const OUT = join(FX, 'out', provider);
mkdirSync(OUT, { recursive: true });

/**
 * Local file AssetStore (Eli Q2a). The registry hands adapters the input-only ctx built from
 * this; the registry itself uses `store`/`fetchUrl` to persist provider-native outputs. Local
 * files need no real signing, so `signUrl` returns the path — providers here return bytes.
 */
import type { AssetStore } from '../packages/providers/execution-context.ts';
function makeLocalStore(dir: string): AssetStore {
  let n = 0;
  const fetchUrl = async (key: string): Promise<Buffer> => {
    const r = await fetch(key);
    if (!r.ok) throw new Error(`fetch ${key} -> ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  return {
    async load(key: string): Promise<Buffer> {
      if (/^https?:\/\//.test(key)) return fetchUrl(key);
      return readFileSync(key);
    },
    async store(bytes: Buffer, hint: string): Promise<string> {
      const p = join(dir, `${String(n++).padStart(3, '0')}-${hint.replace(/[^a-z0-9._-]/gi, '_')}.png`);
      writeFileSync(p, bytes);
      return p;
    },
    async signUrl(key: string): Promise<string> {
      return key; // local files: the key IS the path
    },
    fetchUrl,
  };
}
// Store selection (VHE-ISSUE-LOG-0027): fal is URL-in/URL-out — its inputs must be signed to a
// PUBLICLY reachable URL, which the local-path store cannot do. So fal defaults to the S3-backed
// store; openai/google keep the local-file store (they read input bytes, not URLs). `VAL_STORE`
// (local|s3) overrides. The S3 store reads credentials from .env and NEVER prints them.
const useS3 = (process.env.VAL_STORE ?? (provider === 'fal' ? 's3' : 'local')) === 's3';
let store: AssetStore;
if (useS3) {
  const { makeS3AssetStoreFromEnv } = await import('../packages/storage/s3-store.ts');
  store = makeS3AssetStoreFromEnv({ prefix: `vhe-validation/${provider}` });
  console.log(`[store] S3-backed AssetStore (SigV4 presigned inputs) for provider=${provider}`);
} else {
  store = makeLocalStore(OUT);
  console.log(`[store] local-file AssetStore for provider=${provider}`);
}

const { registerAdapter, clearAdapters, runGeneration } = await import('../packages/providers/registry.ts');
const { runImageInpaint } = await import('../packages/repair/inpaint.ts');
const { MaskObject } = await import('../packages/masks/masks.ts');
const { closePool } = await import('../packages/db/client.ts');

clearAdapters();
if (provider === 'openai') {
  const { makeOpenAIImageInpaintAdapter } = await import('../packages/providers/adapters/openai-image.ts');
  registerAdapter(makeOpenAIImageInpaintAdapter({ ...(model ? { model } : {}) }));
} else if (provider === 'google') {
  const { makeGeminiImageInpaintAdapter } = await import('../packages/providers/adapters/gemini-image.ts');
  registerAdapter(makeGeminiImageInpaintAdapter({ ...(model ? { model } : {}) }));
} else if (provider === 'fal') {
  // NOTE (VHE-ISSUE-LOG-0026): fal fetches inputs BY URL, so this harness's local-path store
  // (signUrl → local path) CANNOT drive a live fal call — fal's servers can't reach a local
  // path. A live fal run additionally needs an S3-backed AssetStore whose signUrl returns a
  // presigned public URL. Registration is wired here for that future run; do not expect the
  // local-file path above to work for fal.
  const { makeFalImageInpaintAdapter } = await import('../packages/providers/adapters/fal-image.ts');
  registerAdapter(makeFalImageInpaintAdapter({ ...(model ? { model } : {}) }));
} else {
  throw new Error(`unknown VAL_PROVIDER '${provider}'`);
}

const results: unknown[] = [];
for (const [fixture, fc] of Object.entries(cfg.fixtures)) {
  const srcBytes = readFileSync(join(FX, fixture));
  const meta = await sharp(srcBytes).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const srcKey = await store.store(srcBytes, `src-${fixture}`);
  const mask = MaskObject.parse({
    id: `m-${fixture}`, assetId: fixture, featherPx: fc.featherPx,
    shapes: [{ t: 'rect', x: fc.mask.x, y: fc.mask.y, w: fc.mask.w, h: fc.mask.h }],
    keyFrame: null, frameRange: null,
  });
  const userInstruction = fixture.includes('hand')
    ? 'Remove the extra malformed finger and restore a single natural, anatomically correct hand'
    : 'Replace the garbled text with clean, plausible lettering that matches the surrounding sign';

  const t0 = Date.now();
  try {
    const out = await runImageInpaint(
      { ownerId: owner, mask, assetWidth: W, assetHeight: H, sourceImageKey: srcKey, userInstruction, candidateCount: 2 },
      // Eli Q2a: the registry needs the store to normalize provider-native outputs → assetKeys.
      { loadImage: store.load, storeImage: store.store, runGeneration, runGenerationOpts: { store } },
    );
    writeFileSync(join(OUT, `${fixture}.before.png`), srcBytes);
    let i = 0;
    for (const c of out.candidates) {
      writeFileSync(join(OUT, `${fixture}.after.${i++}.png`), await store.load(c.compositedKey));
    }
    const row = {
      provider, fixture, ok: true, connectionId: out.providerId, providerSlug: out.providerSlug,
      costCents: out.costCents, requested: out.requestedCandidateCount, returned: out.candidates.length,
      box: out.box, ms: Date.now() - t0, out: OUT,
    };
    results.push(row);
    console.log(JSON.stringify(row));
  } catch (err) {
    const row = { provider, fixture, ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}

writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
await closePool();
console.log(`\nvalidation results written to ${join(OUT, 'results.json')}`);
