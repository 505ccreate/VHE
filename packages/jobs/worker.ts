/**
 * VHE-2 §4.2 — Worker-side execution (the verbatim skeleton for every worker).
 *
 * Transcribed from §4.2 in VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx, whose
 * .docx paragraph-collapse fused the whole body onto single lines
 * (VHE-ISSUE-LOG-0013 (B)); line boundaries are reconstructed, tokens verbatim.
 *
 * The optimistic queued→running transition (only ONE worker wins) and the
 * heartbeat-takeover clause (`status='running' AND heartbeat_at < now() -
 * interval '120 seconds'`) are the mechanism §4's exit gate tests: kill a worker
 * mid-job, restart, resume without a second bill. That end-to-end test needs a
 * live BullMQ harness and is deferred with the runtime below (VHE-ISSUE-LOG-0015).
 *
 * `bullmq`, `db`, `redis`, `handlers`, `publishProgress`, `publishState` are the
 * §4.2 collaborators; wired by the runtime that constructs the Worker. Kept as a
 * typed factory so the transition SQL is exercised in isolation.
 */

import type { PoolClient } from 'pg';
import { classifyError } from './errors.ts';
import type { JobRow } from './create.ts';

export type ProgressFn = (p: number) => void;
export type JobHandler = (row: JobRow, onProgress: ProgressFn) => Promise<{
  output: unknown;
  costCents?: number;
  providerId?: string | null;
}>;

/**
 * The optimistic transition, verbatim from §4.2. Returns the claimed row, or null
 * if another worker already owns it and its heartbeat is fresh (stale duplicate
 * delivery → the caller drops silently).
 */
export async function claimForExecution(client: PoolClient, jobId: string): Promise<JobRow | null> {
  const row = await client.query<JobRow>(
    `UPDATE jobs SET status='running', attempt=attempt+1, heartbeat_at=now(), updated_at=now()
     WHERE id=$1
       AND status IN ('queued','running')  -- 'running' allows takeover after stall
       AND (status='queued' OR heartbeat_at < now() - interval '120 seconds')
     RETURNING *`,
    [jobId],
  );
  return (row.rowCount ?? 0) === 0 ? null : (row.rows[0] as JobRow);
}

/**
 * §4.2 execution body around a claimed row: heartbeat every 30s, run the handler,
 * write terminal state, classify errors per §4.3, let BullMQ retry the retryable
 * ones up to attempt 3. `db.query` and the publishers are injected.
 */
export async function executeClaimed(
  row: JobRow,
  deps: {
    query: (text: string, params?: unknown[]) => Promise<unknown>;
    handlers: Record<string, JobHandler>;
    publishProgress: (jobId: string, p: number) => void;
    publishState: (jobId: string, state: 'succeeded' | 'failed') => void;
  },
): Promise<void> {
  const jobId = row.id;
  const hb = setInterval(
    () => void deps.query(`UPDATE jobs SET heartbeat_at=now() WHERE id=$1`, [jobId]),
    30_000,
  );
  try {
    const result = await deps.handlers[row.type]!(row, (p) => deps.publishProgress(jobId, p));
    await deps.query(
      `UPDATE jobs SET status='succeeded', output=$2, progress=1, cost_cents=$3,
              provider_id=$4, updated_at=now() WHERE id=$1`,
      [jobId, JSON.stringify(result.output), result.costCents ?? 0, result.providerId ?? null],
    );
    deps.publishState(jobId, 'succeeded');
  } catch (e) {
    const { code, retryable } = classifyError(e);
    if (retryable && row.attempt < 3) throw e; // let BullMQ retry with backoff
    await deps.query(
      `UPDATE jobs SET status='failed', error_code=$2, error_detail=$3, updated_at=now()
       WHERE id=$1`,
      [jobId, code, String(e).slice(0, 2000)],
    );
    deps.publishState(jobId, 'failed');
  } finally {
    clearInterval(hb);
  }
}
