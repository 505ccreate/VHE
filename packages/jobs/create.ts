/**
 * VHE-2 §4.1 — API-side idempotency claim. "The critical rule the whole system
 * hangs on: the idempotency claim happens at the API layer, BEFORE anything is
 * enqueued. The worker never inserts job rows."
 *
 * The claim-on-insert (INSERT ... ON CONFLICT (idempotency_key) DO NOTHING
 * RETURNING id) and the winner-only enqueue are copied verbatim in shape from
 * §4.1. Two dependencies §4.1 references are injected rather than hard-wired,
 * because their owning sections are not built yet — flagged, not invented:
 *   - `estimateCostCents` (§7 per-capability table) → `deps.estimateCostCents`,
 *     defaulting to 0 until §7 exists. The budget gate itself is verbatim.
 *   - `queues[type].add(...)` (BullMQ) → `deps.enqueue`, so the claim is testable
 *     without a live queue. The §4.2 worker runtime + BullMQ jobId dedupe is
 *     transcribed in worker.ts and its end-to-end test is deferred
 *     (VHE-ISSUE-LOG-0015).
 */

import { ulid } from 'ulid';
import type { PoolClient } from 'pg';
import { query as poolQuery } from '../db/client.ts';
import { ApiError } from './errors.ts';

export type JobType =
  | 'ingest.probe'
  | 'generate.image'
  | 'inpaint.image'
  | 'track.mask'
  | 'repair.range'
  | 'generate.segment'
  | 'stitch'
  | 'export';

export interface JobRow {
  id: string;
  owner_id: string;
  project_id: string | null;
  type: JobType;
  status: string;
  input: unknown;
  idempotency_key: string;
  parent_job_id: string | null;
  cost_cents: number;
  attempt: number;
  [k: string]: unknown;
}

export interface CreateJobDeps {
  /** §7 per-capability cost estimate; defaults to 0 until §7 exists. */
  estimateCostCents?: (type: JobType, input: unknown) => number;
  /** §4.1 step 2 winner-only enqueue (BullMQ in production). */
  enqueue: (type: JobType, jobId: string) => Promise<void>;
  /** Injectable query fn so tests can run on a dedicated connection; defaults to the pool. */
  query?: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

async function periodSpendCents(q: CreateJobDeps['query'], ownerId: string): Promise<number> {
  // §2: spend is computed live, not stored.
  const run = q ?? (poolQuery as any);
  const { rows } = await run(
    `SELECT COALESCE(SUM(cost_cents), 0)::int AS spend FROM jobs
     WHERE owner_id = $1
       AND created_at >= (SELECT COALESCE(
             (SELECT period_start FROM budgets WHERE owner_id = $1),
             date_trunc('month', now())::date))`,
    [ownerId],
  );
  return Number(rows[0]?.spend ?? 0);
}

async function budgetCapCents(q: CreateJobDeps['query'], ownerId: string): Promise<number> {
  const run = q ?? (poolQuery as any);
  const { rows } = await run(`SELECT cap_cents FROM budgets WHERE owner_id = $1`, [ownerId]);
  return Number(rows[0]?.cap_cents ?? 0); // 0 = no cap (§2 default)
}

/**
 * POST /jobs handler core. Client MUST send an Idempotency-Key (a ulid it
 * generates once per user action). Firing this twice with one key produces
 * exactly one job row and exactly one enqueue.
 */
export async function createJob(
  ownerId: string,
  projectId: string | null,
  type: JobType,
  input: unknown,
  idemKey: string,
  deps: CreateJobDeps,
): Promise<JobRow> {
  const run = deps.query ?? (poolQuery as any);
  const estimate = deps.estimateCostCents ?? (() => 0);

  // 0. Budget gate — BEFORE the claim.
  const spend = await periodSpendCents(deps.query, ownerId);
  const cap = await budgetCapCents(deps.query, ownerId);
  const est = estimate(type, input);
  if (cap > 0 && spend + est > cap) throw new ApiError('BUDGET_EXCEEDED', 402);

  // 1. Claim-on-insert. Exactly one request wins; every retry gets the same job back.
  const jobId = ulid();
  const claimed = await run(
    `INSERT INTO jobs (id, owner_id, project_id, type, status, input, idempotency_key)
     VALUES ($1,$2,$3,$4,'queued',$5,$6)
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [jobId, ownerId, projectId, type, JSON.stringify(input), idemKey],
  );
  if (claimed.rowCount === 0) {
    // Someone already claimed this action — return the existing job, DO NOT enqueue again.
    const { rows } = await run(`SELECT * FROM jobs WHERE idempotency_key = $1`, [idemKey]);
    return rows[0] as JobRow;
  }

  // 2. Only the winner enqueues. Queue payload carries the DB job id — nothing else is authoritative.
  await deps.enqueue(type, jobId);
  const { rows } = await run(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  return rows[0] as JobRow;
}

/**
 * §9.5 child claim. This keeps §4's original top-level `createJob` SQL untouched while setting the
 * schema's existing `parent_job_id`. The same budget-before-claim and winner-only enqueue rules
 * apply; `{parentJobId}:win:{index}` remains the deterministic idempotency key.
 */
export async function createChildJob(
  parentJobId: string,
  ownerId: string,
  projectId: string | null,
  type: JobType,
  input: unknown,
  idemKey: string,
  deps: CreateJobDeps,
): Promise<JobRow> {
  const run = deps.query ?? (poolQuery as any);
  const parent = await run(
    `SELECT id FROM jobs
     WHERE id = $1 AND owner_id = $2 AND project_id IS NOT DISTINCT FROM $3`,
    [parentJobId, ownerId, projectId],
  );
  if (parent.rowCount === 0) {
    throw new ApiError('INTERNAL', 409, `parent job ${parentJobId} does not exist in the same owner/project scope`);
  }

  const spend = await periodSpendCents(deps.query, ownerId);
  const cap = await budgetCapCents(deps.query, ownerId);
  const est = (deps.estimateCostCents ?? (() => 0))(type, input);
  if (cap > 0 && spend + est > cap) throw new ApiError('BUDGET_EXCEEDED', 402);

  const jobId = ulid();
  const claimed = await run(
    `INSERT INTO jobs (id, owner_id, project_id, type, status, input, idempotency_key, parent_job_id)
     VALUES ($1,$2,$3,$4,'queued',$5,$6,$7)
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [jobId, ownerId, projectId, type, JSON.stringify(input), idemKey, parentJobId],
  );
  if (claimed.rowCount === 0) {
    const { rows } = await run(
      `SELECT * FROM jobs WHERE idempotency_key = $1 AND parent_job_id = $2`,
      [idemKey, parentJobId],
    );
    if (!rows[0]) throw new ApiError('INTERNAL', 409, `idempotency key ${idemKey} belongs to a different parent`);
    return rows[0] as JobRow;
  }

  await deps.enqueue(type, jobId);
  const { rows } = await run(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  return rows[0] as JobRow;
}

/** Overload used by the §4.2 worker inside its own transaction (shares a claim path). */
export async function insertClaimWithClient(
  client: PoolClient,
  jobId: string,
  ownerId: string,
  projectId: string | null,
  type: JobType,
  input: unknown,
  idemKey: string,
): Promise<boolean> {
  const claimed = await client.query(
    `INSERT INTO jobs (id, owner_id, project_id, type, status, input, idempotency_key)
     VALUES ($1,$2,$3,$4,'queued',$5,$6)
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [jobId, ownerId, projectId, type, JSON.stringify(input), idemKey],
  );
  return (claimed.rowCount ?? 0) > 0;
}
