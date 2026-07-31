/**
 * VHE-2 §7 — Provider Adapters & Capability Routing.
 *
 * §7 EXIT GATE (verbatim): "with two mock adapters (first always fails), a job routes,
 * falls through, succeeds on the second, and the job row shows the second provider_id
 * and its cost."
 *
 * Two layers:
 *   - Deterministic (always runs, no network): crypto round-trip + tamper rejection,
 *     routeChain ordering/filtering, and the exit gate itself via runGeneration with two
 *     mock adapters and an injected query — proving route → fail → fall-through → succeed
 *     and returning the SECOND connection's id + cost.
 *   - Live Postgres (self-skips when DATABASE_URL absent, like create.test/runtime.test):
 *     inserts two real provider_connections rows (keys encrypted with crypto.ts), runs
 *     the same generation, writes provider_id + cost_cents onto a real jobs row, and
 *     asserts the row shows the SECOND provider — the exit gate end-to-end.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ulid } from 'ulid';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
if (existsSync(join(REPO_ROOT, '.env'))) process.loadEnvFile(join(REPO_ROOT, '.env'));

// A test-only KEK so crypto works without touching real secrets. Set BEFORE any crypto
// call; crypto reads the environment lazily and resetKekCache() forces a re-read.
process.env.PROVIDER_KEK_V1 = 'a'.repeat(64); // 32 bytes of 0xAA in hex

const { encryptProviderKey, decryptProviderKey, resetKekCache } = await import('./crypto.ts');
const { routeChain, VISUAL_FALLBACK_ORDER } = await import('./routing.ts');
const { registerAdapter, clearAdapters, runGeneration } = await import('./registry.ts');
const { estimateCostCents } = await import('./cost.ts');
import type { CapabilityManifest, GenRequest, ProviderAdapter } from './types.ts';
import type { ProviderConnection } from './routing.ts';

resetKekCache();

/** A manifest advertising image.inpaint at up to 2048×2048 with mask support. */
function inpaintManifest(slug: string, costHint?: number): CapabilityManifest {
  return {
    providerSlug: slug,
    capabilities: {
      'image.inpaint': {
        maxWidth: 2048,
        maxHeight: 2048,
        supportsSeed: true,
        supportsNegativePrompt: true,
        supportsMask: true,
        supportsReferenceImages: 0,
        costHintCentsPerOp: costHint,
      },
    },
  };
}

const inpaintReq: GenRequest = {
  capability: 'image.inpaint',
  prompt: 'fix the hand',
  width: 1024,
  height: 1024,
  sourceImageKey: 'media/o/a/master.png',
  maskKey: 'masks/m/0000000.png',
};

// ── Deterministic layer ──────────────────────────────────────────────────────────

describe('§7 crypto — AES-256-GCM provider-key storage', () => {
  it('round-trips a key and rejects tampering', () => {
    const enc = encryptProviderKey('sk-live-secret-abc123');
    expect(enc.nonce.length).toBe(12);
    expect(enc.kekVersion).toBe(1);
    expect(decryptProviderKey({
      key_ciphertext: enc.ciphertext,
      key_nonce: enc.nonce,
      kek_version: enc.kekVersion,
    })).toBe('sk-live-secret-abc123');

    const tampered = Buffer.from(enc.ciphertext);
    tampered[0] ^= 0xff;
    expect(() => decryptProviderKey({
      key_ciphertext: tampered,
      key_nonce: enc.nonce,
      kek_version: enc.kekVersion,
    })).toThrow();
  });
});

describe('§7 routeChain', () => {
  const mk = (id: string, slug: string, isDefault = false): ProviderConnection => ({
    id,
    providerSlug: slug,
    manifest: inpaintManifest(slug),
    isDefaultFor: isDefault ? ['image.inpaint'] : [],
  });

  it('orders unranked-free providers by the fal→replicate→google→openai fallback', () => {
    const chain = routeChain(inpaintReq, [
      mk('c-openai', 'openai'),
      mk('c-google', 'google'),
      mk('c-replicate', 'replicate'),
      mk('c-fal', 'fal'),
    ]);
    expect(chain.map((c) => c.providerSlug)).toEqual([...VISUAL_FALLBACK_ORDER]);
  });

  it('puts the owner is_default_for choice ahead of the fallback ranking', () => {
    const chain = routeChain(inpaintReq, [
      mk('c-fal', 'fal'),
      mk('c-openai', 'openai', true), // owner default, despite being last in fallback order
    ]);
    expect(chain.map((c) => c.providerSlug)).toEqual(['openai', 'fal']);
  });

  it('filters out providers that fail the manifest (dimensions, mask, capability)', () => {
    const tooSmall: ProviderConnection = {
      id: 'c-small', providerSlug: 'fal',
      manifest: { providerSlug: 'fal', capabilities: { 'image.inpaint': {
        maxWidth: 512, maxHeight: 512, supportsSeed: true, supportsNegativePrompt: true,
        supportsMask: true, supportsReferenceImages: 0 } } },
      isDefaultFor: [],
    };
    const noMask: ProviderConnection = {
      id: 'c-nomask', providerSlug: 'replicate',
      manifest: { providerSlug: 'replicate', capabilities: { 'image.inpaint': {
        maxWidth: 2048, maxHeight: 2048, supportsSeed: true, supportsNegativePrompt: true,
        supportsMask: false, supportsReferenceImages: 0 } } },
      isDefaultFor: [],
    };
    const wrongCap: ProviderConnection = {
      id: 'c-t2i', providerSlug: 'google',
      manifest: { providerSlug: 'google', capabilities: { 'image.t2i': {
        maxWidth: 2048, maxHeight: 2048, supportsSeed: true, supportsNegativePrompt: true,
        supportsMask: true, supportsReferenceImages: 0 } } },
      isDefaultFor: [],
    };
    const good = mk('c-good', 'openai');
    const chain = routeChain(inpaintReq, [tooSmall, noMask, wrongCap, good]);
    expect(chain.map((c) => c.id)).toEqual(['c-good']);
  });

  it('returns an empty chain when nothing is eligible', () => {
    expect(routeChain(inpaintReq, [])).toEqual([]);
  });
});

describe('§7 exit gate (deterministic) — route → fail → fall through → succeed', () => {
  beforeEach(() => clearAdapters());

  it('routes past the failing adapter to the second and returns its id + cost', async () => {
    const failing: ProviderAdapter = {
      slug: 'mock-fail',
      async describeCapabilities() { return inpaintManifest('mock-fail'); },
      async submit() { throw new Error('mock-fail always fails'); },
      async poll() { throw new Error('unreached'); },
    };
    const succeeding: ProviderAdapter = {
      slug: 'mock-ok',
      async describeCapabilities() { return inpaintManifest('mock-ok'); },
      async submit() { return { immediate: { assetKeys: ['renders/out.png'], costCents: 7 } }; },
      async poll() { throw new Error('unreached'); },
    };
    registerAdapter(failing);
    registerAdapter(succeeding);

    // Two connections in order [fail, ok]; neither is in the fallback ranking, so input
    // order holds. Inject the encrypted rows the query would return for key decryption.
    const failEnc = encryptProviderKey('key-fail');
    const okEnc = encryptProviderKey('key-ok');
    const rowsById: Record<string, any> = {
      'conn-fail': { key_ciphertext: failEnc.ciphertext, key_nonce: failEnc.nonce, kek_version: failEnc.kekVersion },
      'conn-ok': { key_ciphertext: okEnc.ciphertext, key_nonce: okEnc.nonce, kek_version: okEnc.kekVersion },
    };
    const query = async (_t: string, params?: unknown[]) => ({
      rows: [rowsById[String(params?.[0])]].filter(Boolean),
      rowCount: 1,
    });

    const connections: ProviderConnection[] = [
      { id: 'conn-fail', providerSlug: 'mock-fail', manifest: inpaintManifest('mock-fail'), isDefaultFor: [] },
      { id: 'conn-ok', providerSlug: 'mock-ok', manifest: inpaintManifest('mock-ok'), isDefaultFor: [] },
    ];

    const out = await runGeneration('owner-x', inpaintReq, { connections, query });
    expect(out.connectionId).toBe('conn-ok'); // the SECOND provider
    expect(out.providerSlug).toBe('mock-ok');
    expect(out.costCents).toBe(7); // adapter-reported cost
    expect(out.result.assetKeys).toEqual(['renders/out.png']);
    // legacy GenResult costCents is treated as the provider-reported figure (Eli Q2c)
    expect(out.cost.authoritative).toBe('reported');
    expect(out.cost.reportedCents).toBe(7);
  });

  it('throws NO_PROVIDER when the chain is empty (before any spend)', async () => {
    await expect(runGeneration('owner-x', inpaintReq, { connections: [] })).rejects.toMatchObject({
      code: 'NO_PROVIDER',
    });
  });
});

describe('§7 native adapter → registry normalization (Eli Q2a)', () => {
  beforeEach(() => clearAdapters());

  const nativeAdapter: ProviderAdapter = {
    slug: 'mock-native',
    async describeCapabilities() { return inpaintManifest('mock-native'); },
    // returns PROVIDER-NATIVE bytes, NOT assetKeys — the registry must convert them
    async submit() { return { immediate: { outputs: [{ kind: 'bytes', bytes: Buffer.from('patch-bytes'), mimeType: 'image/png' }] } }; },
    async poll() { throw new Error('unreached'); },
  };

  const enc = encryptProviderKey('key-native');
  const query = async () => ({ rows: [{ key_ciphertext: enc.ciphertext, key_nonce: enc.nonce, kek_version: enc.kekVersion }], rowCount: 1 });
  const connections: ProviderConnection[] = [
    { id: 'conn-native', providerSlug: 'mock-native', manifest: inpaintManifest('mock-native'), isDefaultFor: [] },
  ];

  it('downloads/stores native outputs into assetKeys when a store is supplied', async () => {
    registerAdapter(nativeAdapter);
    const stored: Buffer[] = [];
    const store = {
      async load(k: string) { return Buffer.from(k); },
      async store(b: Buffer, hint: string) { stored.push(b); return `mem/${hint}`; },
      async signUrl(k: string) { return k; },
      async fetchUrl(u: string) { return Buffer.from(u); },
    };
    const out = await runGeneration('owner-x', inpaintReq, { connections, query, store });
    expect(out.result.assetKeys).toHaveLength(1);
    expect(out.result.assetKeys[0]).toMatch(/^mem\/mock-native-output-/);
    expect(stored[0]!.toString()).toBe('patch-bytes');
    // Cost record (Eli Q2c): uncatalogued mock model → dashboard-authoritative estimate, which
    // falls back to the §7 per-capability default (image.inpaint = 15) so costCents is never 0.
    expect(out.cost.authoritative).toBe('dashboard');
    expect(out.cost.reportedCents).toBeNull();
    expect(out.costCents).toBe(15);
    expect(out.cost.estimatedCents).toBe(15);
  });

  it('fails INTERNAL when a native adapter returns outputs but no store was supplied', async () => {
    registerAdapter(nativeAdapter);
    // NO_PROVIDER wraps the per-connection failure; the underlying cause is the missing store.
    await expect(runGeneration('owner-x', inpaintReq, { connections, query })).rejects.toMatchObject({
      code: 'NO_PROVIDER',
    });
  });
});

describe('§7 estimateCostCents (createJob sync seam)', () => {
  it('is 0 for local job types and a positive default for provider types', () => {
    expect(estimateCostCents('ingest.probe', {})).toBe(0);
    expect(estimateCostCents('stitch', {})).toBe(0);
    expect(estimateCostCents('inpaint.image', {})).toBeGreaterThan(0);
    expect(estimateCostCents('generate.segment', {})).toBeGreaterThan(0);
  });
});

// ── Live Postgres layer (self-skips without creds) ───────────────────────────────

const HAS_DB = Boolean(process.env.DATABASE_URL);
if (!HAS_DB) console.log('[§7 live] skipped — DATABASE_URL not set (VHE-ISSUE-LOG-0011).');
const dLive = HAS_DB ? describe : describe.skip;

const { getPool, closePool } = await import('../db/client.ts');

dLive('§7 exit gate (live Postgres) — job row shows the second provider_id + cost', () => {
  const owner = `test_owner_${ulid()}`;

  beforeEach(() => clearAdapters());
  afterAll(async () => {
    const pool = await getPool();
    await pool.query(`DELETE FROM jobs WHERE owner_id = $1`, [owner]);
    await pool.query(`DELETE FROM provider_connections WHERE owner_id = $1`, [owner]);
    await closePool();
  });

  it('routes, falls through, succeeds on the second, and persists provider_id + cost_cents', async () => {
    const pool = await getPool();

    const failing: ProviderAdapter = {
      slug: 'mock-fail',
      async describeCapabilities() { return inpaintManifest('mock-fail'); },
      async submit() { throw new Error('mock-fail always fails'); },
      async poll() { throw new Error('unreached'); },
    };
    const succeeding: ProviderAdapter = {
      slug: 'mock-ok',
      async describeCapabilities() { return inpaintManifest('mock-ok'); },
      async submit() { return { immediate: { assetKeys: ['renders/live.png'], costCents: 11 } }; },
      async poll() { throw new Error('unreached'); },
    };
    registerAdapter(failing);
    registerAdapter(succeeding);

    const failId = ulid();
    const okId = ulid();
    for (const [id, slug] of [[failId, 'mock-fail'], [okId, 'mock-ok']] as const) {
      const enc = encryptProviderKey(`key-${slug}`);
      await pool.query(
        `INSERT INTO provider_connections
           (id, owner_id, provider_slug, key_ciphertext, key_nonce, kek_version, capabilities)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, owner, slug, enc.ciphertext, enc.nonce, enc.kekVersion, JSON.stringify(inpaintManifest(slug))],
      );
    }

    // A real job row to receive provider_id + cost_cents.
    const jobId = ulid();
    await pool.query(
      `INSERT INTO jobs (id, owner_id, type, status, input, idempotency_key)
       VALUES ($1,$2,'inpaint.image','running',$3,$4)`,
      [jobId, owner, JSON.stringify(inpaintReq), ulid()],
    );

    const out = await runGeneration(owner, inpaintReq);
    expect(out.connectionId).toBe(okId); // the SECOND provider won
    expect(out.costCents).toBe(11);

    await pool.query(
      `UPDATE jobs SET provider_id=$1, cost_cents=$2, status='succeeded', updated_at=now() WHERE id=$3`,
      [out.connectionId, out.costCents, jobId],
    );

    const { rows } = await pool.query(`SELECT provider_id, cost_cents FROM jobs WHERE id=$1`, [jobId]);
    expect(rows[0].provider_id).toBe(okId);
    expect(rows[0].cost_cents).toBe(11);
  });
});
