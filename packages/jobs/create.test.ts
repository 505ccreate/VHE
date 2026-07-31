/**
 * VHE-2 §4 exit gate, first clause (verified LIVE against the Supabase Postgres):
 * firing createJob twice with one Idempotency-Key produces exactly ONE job row and
 * exactly ONE enqueue ("provider call"), asserted with an enqueue counter.
 *
 * The second clause — kill a worker mid-job, restart, resume via heartbeat takeover
 * without a second bill — needs a live BullMQ runtime and is deferred
 * (VHE-ISSUE-LOG-0015). The §4.2 transition SQL that makes takeover possible is
 * exercised here at the unit level via claimForExecution against real rows.
 *
 * This test hits the network DB; it self-skips (passing, with a console note) when
 * DATABASE_URL is absent so the suite stays green on a machine without creds.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ulid } from 'ulid';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
if (existsSync(join(REPO_ROOT, '.env'))) process.loadEnvFile(join(REPO_ROOT, '.env'));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const { createJob, createChildJob } = await import('./create.ts');
const { claimForExecution } = await import('./worker.ts');
const { getPool, closePool } = await import('../db/client.ts');

d('§4 idempotency claim (live Postgres)', () => {
  const owner = `test_owner_${ulid()}`;

  afterAll(async () => {
    const pool = await getPool();
    await pool.query(`DELETE FROM jobs WHERE owner_id = $1`, [owner]);
    await closePool();
  });

  it('double createJob with one Idempotency-Key → exactly one row and one enqueue', async () => {
    const idemKey = ulid();
    let enqueueCount = 0;
    const deps = {
      enqueue: async () => { enqueueCount += 1; },
    };

    const first = await createJob(owner, null, 'ingest.probe', { a: 1 }, idemKey, deps);
    const second = await createJob(owner, null, 'ingest.probe', { a: 1 }, idemKey, deps);

    expect(second.id).toBe(first.id); // retry gets the same job back
    expect(enqueueCount).toBe(1); // only the winner enqueued — no double provider call

    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM jobs WHERE idempotency_key = $1`,
      [idemKey],
    );
    expect(rows[0].n).toBe(1); // exactly one row
  }, 60_000);

  it('§9.5 child claim sets parent_job_id and stays idempotent', async () => {
    const parent = await createJob(owner, null, 'repair.range', { range: { a: 0, b: 299 } }, ulid(), {
      enqueue: async () => {},
    });
    const idemKey = `${parent.id}:win:0`;
    let enqueueCount = 0;
    const deps = { enqueue: async () => { enqueueCount += 1; } };
    const input = { windowIndex: 0, range: { a: 0, b: 47 } };
    const first = await createChildJob(parent.id, owner, null, 'repair.range', input, idemKey, deps);
    const second = await createChildJob(parent.id, owner, null, 'repair.range', input, idemKey, deps);
    expect(second.id).toBe(first.id);
    expect(first.parent_job_id).toBe(parent.id);
    expect(enqueueCount).toBe(1);

    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n, max(parent_job_id) AS parent FROM jobs WHERE idempotency_key = $1`,
      [idemKey],
    );
    expect(rows[0]).toEqual({ n: 1, parent: parent.id });
  }, 60_000);

  it('budget cap blocks the claim when spend+est would exceed it', async () => {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO budgets (owner_id, cap_cents) VALUES ($1, 100)
       ON CONFLICT (owner_id) DO UPDATE SET cap_cents = 100`,
      [owner],
    );
    try {
      let enqueued = 0;
      await expect(
        createJob(owner, null, 'generate.image', {}, ulid(), {
          enqueue: async () => { enqueued += 1; },
          estimateCostCents: () => 200, // over the 100-cent cap
        }),
      ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
      expect(enqueued).toBe(0);
    } finally {
      await pool.query(`DELETE FROM budgets WHERE owner_id = $1`, [owner]);
    }
  }, 60_000);

  it('§4.2 optimistic transition: only the first claim of a queued row wins', async () => {
    const idemKey = ulid();
    const job = await createJob(owner, null, 'ingest.probe', {}, idemKey, { enqueue: async () => {} });

    const pool = await getPool();
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      const first = await claimForExecution(c1, job.id);
      const second = await claimForExecution(c2, job.id); // heartbeat is fresh → no takeover
      expect(first).not.toBeNull();
      expect(first!.status).toBe('running');
      expect(second).toBeNull(); // stale duplicate delivery drops silently
    } finally {
      c1.release();
      c2.release();
    }
  }, 60_000);

  it('§4 exit gate clause 2: a stalled job (heartbeat > 120s old) is taken over without a second bill', async () => {
    // Simulates "kill a worker mid-job and restart" without a 2-minute wait: worker A
    // claims and runs, then dies without clearing status; its heartbeat ages past 120s.
    // Worker B must take over (the row's cost_cents is untouched — no double bill).
    const idemKey = ulid();
    const job = await createJob(owner, null, 'ingest.probe', {}, idemKey, { enqueue: async () => {} });
    const pool = await getPool();

    const cA = await pool.connect();
    let takenOver: Awaited<ReturnType<typeof claimForExecution>> = null;
    try {
      const a = await claimForExecution(cA, job.id); // worker A wins, status=running, attempt=1
      expect(a).not.toBeNull();
      expect(a!.attempt).toBe(1);

      // Worker A "crashes": its heartbeat freezes and ages past the 120s takeover window.
      await pool.query(`UPDATE jobs SET heartbeat_at = now() - interval '121 seconds' WHERE id = $1`, [job.id]);

      const cB = await pool.connect();
      try {
        takenOver = await claimForExecution(cB, job.id); // worker B takes over
      } finally {
        cB.release();
      }
    } finally {
      cA.release();
    }

    expect(takenOver).not.toBeNull(); // takeover happened
    expect(takenOver!.status).toBe('running');
    expect(takenOver!.attempt).toBe(2); // second attempt — the takeover, not a fresh job

    // No second bill: exactly one job row for this action, cost untouched by the takeover.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n, max(cost_cents)::int AS cost FROM jobs WHERE idempotency_key = $1`,
      [idemKey],
    );
    expect(rows[0].n).toBe(1);
    expect(rows[0].cost).toBe(0);
  }, 60_000);
});
