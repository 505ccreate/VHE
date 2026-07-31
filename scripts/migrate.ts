/**
 * Minimal migration runner — applies migrations/NNNN_*.sql in lexical order.
 *
 * DELEGATED decision (VHE-ISSUE-LOG-0012): VHE-2 §2 says "Run as migration 0001"
 * but prescribes no runner. drizzle-kit is not in the §1 package list, so this
 * runner uses only the receipt-verified `pg` dependency. Mechanics:
 *   - `schema_migrations` bookkeeping table (runner-owned; not part of any
 *     numbered migration — §2's SQL stays verbatim in its own file).
 *   - Each migration runs inside one transaction; the bookkeeping row commits
 *     atomically with the DDL, so a failed migration leaves no trace.
 *   - Applied migrations are sha256-pinned: re-running after a file was edited
 *     is an error, not a silent divergence (same identity-not-presence rule as
 *     preflight).
 *
 * Run: node --experimental-strip-types scripts/migrate.ts        (applies pending)
 *      node --experimental-strip-types scripts/migrate.ts --status  (report only)
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'migrations');

if (existsSync(join(REPO_ROOT, '.env'))) {
  try {
    process.loadEnvFile(join(REPO_ROOT, '.env'));
  } catch {
    // unreadable .env — fall through to plain environment
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set (.env or environment). Refusing to run.');
  process.exit(1);
}

const statusOnly = process.argv.includes('--status');

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  if (files.length === 0) {
    console.error(`No NNNN_*.sql files found in ${MIGRATIONS_DIR}.`);
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const { rows: appliedRows } = await client.query(
      'SELECT id, sha256 FROM schema_migrations ORDER BY id',
    );
    const applied = new Map<string, string>(appliedRows.map((r: any) => [r.id, r.sha256]));

    let ran = 0;
    for (const file of files) {
      const id = file.replace(/\.sql$/, '');
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');

      const prior = applied.get(id);
      if (prior !== undefined) {
        if (prior !== hash) {
          console.error(
            `✗ ${id}: file on disk (sha256 ${hash.slice(0, 16)}…) differs from the applied ` +
              `version (${prior.slice(0, 16)}…). Applied migrations are immutable — write a new ` +
              `numbered migration instead. Aborting.`,
          );
          process.exitCode = 1;
          return;
        }
        console.log(`= ${id}: already applied (sha256 match)`);
        continue;
      }

      if (statusOnly) {
        console.log(`○ ${id}: PENDING`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id, sha256) VALUES ($1, $2)', [id, hash]);
        await client.query('COMMIT');
        console.log(`✓ ${id}: applied (sha256 ${hash.slice(0, 16)}…)`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✗ ${id}: failed and rolled back — ${String(err)}`);
        process.exitCode = 1;
        return;
      }
    }

    if (!statusOnly) {
      console.log(`\nDone. ${ran} applied, ${applied.size} previously applied.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('migrate crashed:', err);
  process.exitCode = 1;
});
