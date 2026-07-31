/**
 * VHE-2 §7 — wire ONE real provider connection for the §9.1 real-provider validation.
 *
 * Reads a plaintext provider key from a file (INSIDE this script — the value never reaches
 * stdout, the transcript, or Git), encrypts it with the current PROVIDER_KEK_V<n> (crypto.ts),
 * and upserts an encrypted `provider_connections` row. Prints only a redacted confirmation
 * (provider, owner, connection id, key length, a sha256[:8] fingerprint). Server-side +
 * encrypted-at-rest, exactly per Marcus's ruling (VHE-ISSUE-LOG-0022).
 *
 * Config via env (so no secret ever appears on a command line):
 *   WIRE_PROVIDER  openai | google
 *   WIRE_KEYFILE   absolute path to the key file
 *   WIRE_KEYNAME   the `NAME=value` key line to read (e.g. OPENAI_API_KEY, GEMINI_API_KEY)
 *   WIRE_OWNER     owner_id for the row (default 'vhe-validation-owner')
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { ulid } from 'ulid';

process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));

const provider = process.env.WIRE_PROVIDER;
const keyfile = process.env.WIRE_KEYFILE;
const keyname = process.env.WIRE_KEYNAME;
const owner = process.env.WIRE_OWNER ?? 'vhe-validation-owner';
if (!provider || !keyfile || !keyname) {
  throw new Error('set WIRE_PROVIDER, WIRE_KEYFILE, WIRE_KEYNAME (and optionally WIRE_OWNER)');
}

const text = readFileSync(keyfile, 'utf8');
const escaped = keyname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const m = text.match(new RegExp('^' + escaped + '\\s*=\\s*(.+)$', 'm'));
if (!m) throw new Error(`${keyname}= not found in ${keyfile}`);
const key = m[1]!.trim();
if (!key) throw new Error(`${keyname} is empty in ${keyfile}`);

const MANIFESTS: Record<string, unknown> = {
  openai: { providerSlug: 'openai', capabilities: { 'image.inpaint': {
    maxWidth: 1536, maxHeight: 1536, supportsSeed: false, supportsNegativePrompt: false,
    supportsMask: true, supportsReferenceImages: 0 } } },
  google: { providerSlug: 'google', capabilities: { 'image.inpaint': {
    maxWidth: 1024, maxHeight: 1024, supportsSeed: false, supportsNegativePrompt: false,
    supportsMask: true, supportsReferenceImages: 1 } } },
  // fal (VHE-ISSUE-LOG-0026): mirrors makeFalImageInpaintAdapter.describeCapabilities. The fal
  // key line in the central library file is read with WIRE_KEYNAME (e.g. FAL_KEY); its value is
  // never printed. Wiring the row does NOT authorize a live call — the §1 fixtures + an S3 store
  // are still required before any fal spend.
  fal: { providerSlug: 'fal', capabilities: { 'image.inpaint': {
    maxWidth: 1024, maxHeight: 1024, supportsSeed: true, supportsNegativePrompt: true,
    supportsMask: true, supportsReferenceImages: 1 } } },
};
const manifest = MANIFESTS[provider];
if (!manifest) throw new Error(`unknown provider '${provider}' (openai|google|fal)`);

const { encryptProviderKey } = await import('../packages/providers/crypto.ts');
const { getPool, closePool } = await import('../packages/db/client.ts');

const enc = encryptProviderKey(key);
const pool = await getPool();
await pool.query('DELETE FROM provider_connections WHERE owner_id=$1 AND provider_slug=$2', [owner, provider]);
const id = ulid();
await pool.query(
  `INSERT INTO provider_connections
     (id, owner_id, provider_slug, key_ciphertext, key_nonce, kek_version, capabilities)
   VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  [id, owner, provider, enc.ciphertext, enc.nonce, enc.kekVersion, JSON.stringify(manifest)],
);
await closePool();

const fp = createHash('sha256').update(key).digest('hex').slice(0, 8);
console.log(`wired provider=${provider} owner=${owner} conn=${id} keyLen=${key.length} keySha256[:8]=${fp} kek_v=${enc.kekVersion}`);
