/**
 * Shared Redis connection for the BullMQ transport (VHE-2 §4.1/§4.2 `connection: redis`).
 *
 * Mirrors packages/db/client.ts in shape: reads REDIS_URL from .env (the hosted
 * Redis provisioned in VHE-ISSUE-LOG-0011), opens lazily, exposes a close for tests.
 *
 * Two ioredis options here are REQUIRED by BullMQ and are not stylistic:
 *   - `maxRetriesPerRequest: null` — BullMQ v5 throws at Worker construction without
 *     it, because its blocking BRPOPLPUSH commands must not be aborted by a retry cap.
 *     (Note this is the OPPOSITE of scripts/preflight.ts, which deliberately uses
 *     maxRetriesPerRequest: 0 + retryStrategy: () => null so a bad host fails fast
 *     instead of retry-looping a one-shot check. Different jobs, different settings.)
 *   - `enableReadyCheck: false` — hosted Redis proxies (Upstash-class) do not expose
 *     the full INFO the ready check parses.
 *
 * This module chooses no deployment target; where a Worker process RUNS in production
 * is still the open question in VHE-ISSUE-LOG-0007.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Redis as RedisClient } from 'ioredis';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

function loadEnvOnce(): void {
  const envPath = join(REPO_ROOT, '.env');
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // unreadable .env — fall through to the ambient environment
    }
  }
}

let connection: RedisClient | null = null;

/** The shared BullMQ connection. Queues and Workers reuse one client per process. */
export async function getConnection(): Promise<RedisClient> {
  if (connection) return connection;
  loadEnvOnce();
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not set (.env or environment). Cannot open the BullMQ connection.');
  }
  const { default: Redis } = await import('ioredis');
  connection = new Redis(url, {
    maxRetriesPerRequest: null, // required by BullMQ — see header
    enableReadyCheck: false,
    connectTimeout: 10_000,
  });
  return connection;
}

export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
