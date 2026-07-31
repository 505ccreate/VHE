/**
 * VHE-2 §7 / Security section — provider-key encryption at rest.
 *
 * VHE-2 verbatim (word/document.xml, security paragraph):
 *   "Provider-key encryption: AES-256-GCM, per-row 12-byte nonce (key_nonce), KEK
 *    versioned (kek_version) so keys re-encrypt on rotation. Plaintext keys exist
 *    only in worker memory for the duration of an adapter call, never in logs,
 *    never client-side."
 *
 * Maps 1:1 onto the frozen §2 `provider_connections` columns:
 *   key_ciphertext BYTEA  — AES-256-GCM ciphertext WITH the 16-byte GCM auth tag
 *                           appended (ciphertext || tag); one BYTEA column, one read.
 *   key_nonce      BYTEA  — the 12-byte per-row nonce, never reused.
 *   kek_version    INT    — which key-encryption-key encrypted this row.
 *
 * KEKs come from the environment, one per version: PROVIDER_KEK_V1, PROVIDER_KEK_V2, …
 * Each is a 32-byte AES-256 key, hex (64 chars) or base64. Rotation = add a higher
 * PROVIDER_KEK_V<n>; new rows encrypt under the new version, old rows still decrypt
 * under theirs until re-encrypted. No plaintext KEK is ever hard-coded.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const NONCE_BYTES = 12; // §7: 12-byte per-row nonce
const TAG_BYTES = 16; // AES-GCM auth tag
const KEY_BYTES = 32; // AES-256
const ENV_PREFIX = 'PROVIDER_KEK_V';

/** Decode a 32-byte KEK from hex (64 chars) or base64. Throws on wrong length. */
function decodeKek(raw: string, version: number): Buffer {
  const trimmed = raw.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `${ENV_PREFIX}${version} must decode to ${KEY_BYTES} bytes (got ${buf.length}). ` +
        'Provide a 64-char hex or base64 AES-256 key.',
    );
  }
  return buf;
}

/** Read every PROVIDER_KEK_V<n> present in the environment. Cached after first read. */
let kekCache: Map<number, Buffer> | null = null;
function loadKeks(): Map<number, Buffer> {
  if (kekCache) return kekCache;
  const map = new Map<number, Buffer>();
  for (const [name, value] of Object.entries(process.env)) {
    if (!value) continue;
    const m = name.match(new RegExp(`^${ENV_PREFIX}(\\d+)$`));
    if (m) map.set(Number(m[1]), decodeKek(value, Number(m[1])));
  }
  kekCache = map;
  return map;
}

/** Test/rotation hook: forget cached KEKs so a changed environment is re-read. */
export function resetKekCache(): void {
  kekCache = null;
}

/** The highest configured KEK version — the one new rows encrypt under. */
export function currentKekVersion(): number {
  const keks = loadKeks();
  if (keks.size === 0) {
    throw new Error(
      `No provider KEK configured. Set at least ${ENV_PREFIX}1 to a 32-byte hex/base64 key.`,
    );
  }
  return Math.max(...keks.keys());
}

function kekFor(version: number): Buffer {
  const kek = loadKeks().get(version);
  if (!kek) {
    throw new Error(`Provider KEK version ${version} is not configured (${ENV_PREFIX}${version}).`);
  }
  return kek;
}

export interface EncryptedKey {
  ciphertext: Buffer; // ciphertext || 16-byte GCM tag → key_ciphertext
  nonce: Buffer; // 12 bytes → key_nonce
  kekVersion: number; // → kek_version
}

/** Encrypt a plaintext provider API key under the current KEK version. */
export function encryptProviderKey(plaintextKey: string): EncryptedKey {
  const kekVersion = currentKekVersion();
  const kek = kekFor(kekVersion);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', kek, nonce);
  const enc = Buffer.concat([cipher.update(plaintextKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), nonce, kekVersion };
}

/**
 * Decrypt a `provider_connections` row back to the plaintext key. The returned string
 * lives only as long as the caller holds it — §7 requires it stay out of logs and off
 * the client. A tampered ciphertext/tag/nonce throws (GCM authentication failure).
 */
export function decryptProviderKey(row: {
  key_ciphertext: Buffer;
  key_nonce: Buffer;
  kek_version: number;
}): string {
  const kek = kekFor(row.kek_version);
  const buf = row.key_ciphertext;
  if (buf.length < TAG_BYTES) {
    throw new Error('key_ciphertext too short to contain a GCM auth tag — row is corrupt.');
  }
  const enc = buf.subarray(0, buf.length - TAG_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', kek, row.key_nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
