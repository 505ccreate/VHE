/**
 * Shared Postgres access. A single pooled client for the API + workers, reading
 * DATABASE_URL from .env (the Supabase IPv4 Supavisor pooler, per
 * VHE-ISSUE-LOG-0011). Thin on purpose — §2 is the single source of schema truth;
 * this only opens connections and runs parameterized queries.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Pool as PgPool, PoolClient, QueryResult, QueryResultRow } from 'pg';

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

let pool: PgPool | null = null;

export async function getPool(): Promise<PgPool> {
  if (pool) return pool;
  loadEnvOnce();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (.env or environment). Cannot open a DB pool.');
  }
  const { default: pg } = await import('pg');
  pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 10_000 });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const p = await getPool();
  return p.query<T>(text, params as any[]);
}

/** Run a function inside a single transaction; commits on success, rolls back on throw. */
export async function withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
