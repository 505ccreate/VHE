/**
 * VHE-2 §7 — read the owner's BYOK provider connections from the frozen §2
 * `provider_connections` table and hand routing a key-free view of them.
 *
 * Split of responsibility, per §7's security rule ("plaintext keys exist only in worker
 * memory for the duration of an adapter call"):
 *   - `loadConnections` returns manifests + is_default_for ONLY — never a key. This is
 *     what routing.routeChain consumes.
 *   - `decryptConnectionKey` is called at the LAST moment, once a connection has been
 *     chosen and is about to be invoked, and returns a plaintext key the caller must
 *     drop as soon as the adapter call returns.
 */

import type { Capability, CapabilityManifest } from './types.ts';
import type { ProviderConnection } from './routing.ts';
import { query as poolQuery } from '../db/client.ts';
import { decryptProviderKey } from './crypto.ts';
import { ApiError } from '../jobs/errors.ts';

type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

interface ConnectionRow {
  id: string;
  provider_slug: string;
  capabilities: CapabilityManifest;
  is_default_for: string[];
}

/**
 * Load an owner's connections as routing sees them (no keys). `capabilities` is the §7
 * manifest stored as JSONB; `is_default_for` is the TEXT[] of capability slugs.
 */
export async function loadConnections(ownerId: string, query?: QueryFn): Promise<ProviderConnection[]> {
  const run = query ?? (poolQuery as unknown as QueryFn);
  const { rows } = await run(
    `SELECT id, provider_slug, capabilities, is_default_for
       FROM provider_connections
      WHERE owner_id = $1`,
    [ownerId],
  );
  return (rows as ConnectionRow[]).map((r) => ({
    id: r.id,
    providerSlug: r.provider_slug,
    manifest: r.capabilities,
    isDefaultFor: (r.is_default_for ?? []) as Capability[],
  }));
}

/**
 * Decrypt one connection's API key. Fetches the ciphertext/nonce/kek_version fresh (they
 * are intentionally absent from `loadConnections`) and returns the plaintext. The result
 * must never be logged, persisted, or sent client-side (§7).
 */
export async function decryptConnectionKey(
  ownerId: string,
  connectionId: string,
  query?: QueryFn,
): Promise<string> {
  const run = query ?? (poolQuery as unknown as QueryFn);
  const { rows } = await run(
    `SELECT key_ciphertext, key_nonce, kek_version
       FROM provider_connections
      WHERE id = $1 AND owner_id = $2`,
    [connectionId, ownerId],
  );
  if (rows.length === 0) {
    throw new ApiError('NO_PROVIDER', 404, `provider connection ${connectionId} not found`);
  }
  const row = rows[0] as { key_ciphertext: Buffer; key_nonce: Buffer; kek_version: number };
  return decryptProviderKey(row);
}
