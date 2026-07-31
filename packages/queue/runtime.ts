/**
 * VHE-2 §4.2 — the production Worker runtime: the transport that delivers `{ jobId }`
 * from BullMQ into the already-built, already-verified `claimForExecution` +
 * `executeClaimed` (packages/jobs/worker.ts, VHE-ISSUE-LOG-0015).
 *
 * §4.2's verbatim skeleton is `new Worker(queueName, async (bull) => { ... }, opts)`.
 * The BODY of that skeleton was transcribed in packages/jobs/worker.ts and its
 * correctness (the optimistic queued→running transition and the 120s heartbeat
 * takeover) is already proven live against Postgres — BOTH §4 exit-gate clauses.
 * This file adds only what was missing: the `new Worker(...)` construction around it.
 * The body is CALLED here, not re-transcribed, so there is exactly one copy of the
 * §4.2 logic in the repo.
 *
 * Verbatim Worker options (word/document.xml paras 186–187, not the lossy mirror):
 *     }, { connection: redis, concurrency: 4,
 *      settings: { backoffStrategy: (a) => Math.min(30_000, 1000 * 2 ** a) } });
 *
 * `publishProgress` / `publishState` are §14 (realtime events, not built). Injected
 * with no-op defaults per the "inject-don't-invent" pattern established in
 * VHE-ISSUE-LOG-0015 §3 — flagged, not fabricated. `handlers` is injected because the
 * per-type job handlers arrive with §7+ and none exist yet.
 *
 * Choosing WHERE this process runs in production remains open (VHE-ISSUE-LOG-0007).
 * This module only makes it runnable; it writes no deployment config.
 */

import type { Worker, Processor } from 'bullmq';
import type { JobType } from '../jobs/create.ts';
import type { JobHandler } from '../jobs/worker.ts';
import { claimForExecution, executeClaimed } from '../jobs/worker.ts';
import { getPool, query as poolQuery } from '../db/client.ts';
import { getConnection } from './connection.ts';

export interface WorkerDeps {
  /** Per-type job handlers. §7+ supplies these; none exist yet. */
  handlers: Record<string, JobHandler>;
  /** §14 realtime events — no-op until §14 is built. */
  publishProgress?: (jobId: string, p: number) => void;
  publishState?: (jobId: string, state: 'succeeded' | 'failed') => void;
  /** Injectable for tests; defaults to the shared pool. */
  query?: (text: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * The §4.2 processor: claim the row optimistically, then run it. Returns early on a
 * stale duplicate delivery, exactly as §4.2 requires ("if (row.rowCount === 0) return;
 * // stale duplicate delivery — drop silently").
 */
export function makeProcessor(deps: WorkerDeps): Processor<{ jobId: string }, void, string> {
  const publishProgress = deps.publishProgress ?? (() => {});
  const publishState = deps.publishState ?? (() => {});
  const query = deps.query ?? ((text: string, params?: unknown[]) => poolQuery(text, params));

  return async (bull) => {
    const { jobId } = bull.data;

    // Optimistic transition: only ONE worker can move queued -> running.
    const pool = await getPool();
    const client = await pool.connect();
    let row;
    try {
      row = await claimForExecution(client, jobId);
    } finally {
      client.release();
    }
    if (row === null) return; // stale duplicate delivery — drop silently

    try {
      await executeClaimed(row, { query, handlers: deps.handlers, publishProgress, publishState });
    } catch (err) {
      // 🔴 BUILDER RULING (delegated) — VHE-ISSUE-LOG-0017, defect B. Read before changing.
      //
      // executeClaimed rethrows ONLY on the §4.2 retry branch (retryable && attempt < 3),
      // i.e. "I am handing this row back to the queue." But it leaves the row at
      // status='running' with a FRESH heartbeat, and §4.2's re-claim guard only admits
      // status='queued' OR heartbeat older than 120s. The verbatim backoff is capped at
      // `Math.min(30_000, ...)` — 30s — which is strictly less than that 120s window, so
      // the retry ALWAYS loses the re-claim, the processor returns early, and BullMQ marks
      // the attempt completed. Verified live: handler ran once, bull={completed:1}, and the
      // row stranded at status='running' permanently. Silent, and it looks green.
      //
      // Fix: release the row on graceful handback. The 120s heartbeat takeover exists for
      // CRASHED workers, which cannot reset anything; a worker that is alive and choosing
      // to retry can and must release explicitly. These are different paths and only the
      // crash path should depend on the timeout.
      //
      // Deliberately placed HERE, in the BUILDER-owned transport, not in the verbatim §4.2
      // body in packages/jobs/worker.ts — that file stays verbatim. Guarded on status
      // ='running' so it can never disturb a row that already reached a terminal state.
      await query(
        `UPDATE jobs SET status='queued', heartbeat_at=NULL, updated_at=now()
         WHERE id=$1 AND status='running'`,
        [jobId],
      );
      throw err; // hand back to BullMQ for the backoff retry
    }
  };
}

/**
 * Construct the §4.2 Worker for one queue (queue name == JobType). Caller owns the
 * returned Worker's lifetime and must `await worker.close()` on shutdown.
 */
export async function startWorker(queueName: JobType, deps: WorkerDeps): Promise<Worker> {
  const connection = await getConnection();
  const { Worker } = await import('bullmq');
  return new Worker(queueName, makeProcessor(deps), {
    connection,
    concurrency: 4,
    settings: { backoffStrategy: (a: number) => Math.min(30_000, 1000 * 2 ** a) },
  });
}
