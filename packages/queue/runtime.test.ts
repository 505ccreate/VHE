/**
 * VHE-2 §4 transport end-to-end, against LIVE Redis + LIVE Postgres.
 *
 * What VHE-ISSUE-LOG-0015 left open was never the §4 exit gate (both clauses are
 * already proven there against Postgres) — it was whether the BullMQ transport
 * actually delivers `{ jobId }` into that proven path. That is what these tests
 * assert, and it can only be shown with a real Queue and a real Worker.
 *
 * Self-skips (passing, with a note) when DATABASE_URL or REDIS_URL is absent, matching
 * packages/jobs/create.test.ts, so the suite stays green on a machine without creds.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ulid } from 'ulid';
import type { Worker } from 'bullmq';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
if (existsSync(join(REPO_ROOT, '.env'))) process.loadEnvFile(join(REPO_ROOT, '.env'));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const HAS_REDIS = Boolean(process.env.REDIS_URL);
if (!HAS_DB || !HAS_REDIS) {
  console.log(
    `[§4 transport] skipped — ${!HAS_DB ? 'DATABASE_URL' : 'REDIS_URL'} not set (VHE-ISSUE-LOG-0011).`,
  );
}
const d = HAS_DB && HAS_REDIS ? describe : describe.skip;

const { createJob } = await import('../jobs/create.ts');
const { enqueue, getQueue, closeQueues } = await import('./queues.ts');
const { startWorker } = await import('./runtime.ts');
const { getPool, closePool } = await import('../db/client.ts');
const { closeConnection } = await import('./connection.ts');
const { ApiError } = await import('../jobs/errors.ts');

/** Wait until `check` returns a non-null value, or throw after `timeoutMs`. */
async function until<T>(check: () => Promise<T | null>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const got = await check();
    if (got !== null) return got;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

d('§4 BullMQ transport (live Redis + live Postgres)', () => {
  const owner = `test_owner_${ulid()}`;
  const workers: Worker[] = [];

  afterAll(async () => {
    await Promise.all(workers.map((w) => w.close()));
    const pool = await getPool();
    await pool.query(`DELETE FROM jobs WHERE owner_id = $1`, [owner]);
    // Drop these queues' Redis keys so repeat runs start clean.
    for (const name of ['ingest.probe', 'repair.range', 'stitch', 'export'] as const) {
      const q = await getQueue(name);
      await q.obliterate({ force: true }).catch(() => {});
    }
    await closeQueues();
    await closeConnection();
    await closePool();
  });

  it('createJob → real enqueue → Worker claims and runs it → row reaches succeeded', async () => {
    const idemKey = ulid();
    let handlerRan = 0;

    const worker = await startWorker('ingest.probe', {
      handlers: {
        'ingest.probe': async (row, onProgress) => {
          handlerRan += 1;
          onProgress(0.5);
          return { output: { probed: row.id }, costCents: 7, providerId: null };
        },
      },
    });
    workers.push(worker);

    // The real transport: createJob's injected seam is now the production BullMQ enqueue.
    const job = await createJob(owner, null, 'ingest.probe', { a: 1 }, idemKey, { enqueue });

    const pool = await getPool();
    const final = await until(async () => {
      const { rows } = await pool.query(
        `SELECT status, cost_cents, progress, output, attempt FROM jobs WHERE id = $1`,
        [job.id],
      );
      return rows[0]?.status === 'succeeded' || rows[0]?.status === 'failed' ? rows[0] : null;
    });

    expect(handlerRan).toBe(1); // delivered exactly once
    expect(final.status).toBe('succeeded'); // full path: enqueue → claim → execute → terminal write
    expect(final.attempt).toBe(1);
    expect(final.cost_cents).toBe(7); // handler's cost was billed through executeClaimed
    expect(Number(final.progress)).toBe(1);
    expect(final.output).toMatchObject({ probed: job.id });
  }, 60_000);

  it('VHE-ISSUE-LOG-0017 ruling: a retryable §4.3 error IS retried with backoff and can succeed', async () => {
    // This is the test that proves the delegated RETRY_POLICY ruling. With the §4.1
    // add-options copied 100% verbatim ({ jobId } alone) BullMQ defaults to attempts:1,
    // this handler would run exactly ONCE, the row would never reach a terminal state,
    // and §4.2's `throw e` retry branch would be unreachable. Deleting RETRY_POLICY from
    // queues.ts must turn this test red — that is what makes the ruling falsifiable.
    const idemKey = ulid();
    let runs = 0;

    const worker = await startWorker('repair.range', {
      handlers: {
        'repair.range': async (row) => {
          runs += 1;
          if (runs === 1) throw new ApiError('PROVIDER_RATE_LIMIT'); // §4.3 retryable=true
          return { output: { repaired: row.id }, costCents: 3, providerId: null };
        },
      },
    });
    workers.push(worker);

    const job = await createJob(owner, null, 'repair.range', {}, idemKey, { enqueue });

    const pool = await getPool();
    const final = await until(async () => {
      const { rows } = await pool.query(
        `SELECT status, attempt, cost_cents FROM jobs WHERE id = $1`,
        [job.id],
      );
      return rows[0]?.status === 'succeeded' || rows[0]?.status === 'failed' ? rows[0] : null;
    }, 30_000);

    expect(runs).toBe(2); // retried after the retryable failure
    expect(final.status).toBe('succeeded'); // and recovered on the retry
    expect(final.attempt).toBe(2); // second attempt, via the §4.2 re-claim
    expect(final.cost_cents).toBe(3); // billed once, by the attempt that actually succeeded
  }, 60_000);

  it('a permanently-failing retryable job exhausts its attempts and lands on failed (never stranded)', async () => {
    // The other half of the VHE-ISSUE-LOG-0017 defect-B fix: releasing the row on handback
    // must not create a job that retries forever or sticks at 'running'. §4.2's own ceiling
    // (`row.attempt < 3`) must still terminate it, with the §4.3 machine code recorded.
    const idemKey = ulid();
    let runs = 0;

    const worker = await startWorker('stitch', {
      handlers: {
        'stitch': async () => {
          runs += 1;
          throw new ApiError('PROVIDER_TIMEOUT'); // §4.3 retryable=true, always fails
        },
      },
    });
    workers.push(worker);

    const job = await createJob(owner, null, 'stitch', {}, idemKey, { enqueue });

    const pool = await getPool();
    const final = await until(async () => {
      const { rows } = await pool.query(
        `SELECT status, attempt, error_code FROM jobs WHERE id = $1`,
        [job.id],
      );
      return rows[0]?.status === 'succeeded' || rows[0]?.status === 'failed' ? rows[0] : null;
    }, 40_000);

    expect(runs).toBe(3); // attempts 1,2,3 — then §4.2's ceiling stops it
    expect(final.status).toBe('failed'); // terminal, not stranded at 'running'
    expect(final.attempt).toBe(3);
    expect(final.error_code).toBe('PROVIDER_TIMEOUT'); // §4.3 machine code, not a message string
  }, 90_000);

  it('BullMQ jobId dedupe: enqueueing the same jobId twice delivers one job (§4.1 second safety net)', async () => {
    // Deliberately a queue with NO worker attached ('export'), so the count is stable —
    // on 'ingest.probe' the worker from the previous test would consume the job mid-assert.
    const q = await getQueue('export');
    const jobId = ulid();
    await q.add('export', { jobId }, { jobId });
    await q.add('export', { jobId }, { jobId }); // same id — BullMQ drops the duplicate
    const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
    await q.obliterate({ force: true });
  }, 60_000);
});
