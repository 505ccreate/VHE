/**
 * VHE-2 §4.1 step 2 — the production enqueue side of the job transport.
 *
 * §4.1's verbatim line (from word/document.xml, para 179):
 *     await queues[type].add(type, { jobId }, { jobId }); // BullMQ jobId dedupe = second safety net
 *
 * One Queue per JobType, named for the type, so §4.2's `new Worker(queueName, ...)`
 * has a queue name to bind to. The payload carries ONLY the DB job id — §4.1:
 * "Queue payload carries the DB job id — nothing else is authoritative."
 *
 * This is the real `deps.enqueue` that packages/jobs/create.ts has been taking as an
 * injected seam since VHE-ISSUE-LOG-0015 (§3 "inject-don't-invent"). createJob is
 * UNCHANGED by this file — the seam is filled from the outside, as designed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 BUILDER RULING (delegated) — VHE-ISSUE-LOG-0017. See that entry before changing.
 *
 * `RETRY_POLICY` below is NOT in the §4.1 verbatim add-options, which are `{ jobId }`
 * alone. It is added because the verbatim options contradict §4.2/§4.3:
 *   - §4.2 body:    `if (retryable && row.attempt < 3) throw e; // let BullMQ retry with backoff`
 *   - §4.2 options: `settings: { backoffStrategy: (a) => Math.min(30_000, 1000 * 2 ** a) }`
 *   - §4.3:         a whole retryable/non-retryable error taxonomy
 * BullMQ v5 defaults a job to `attempts: 1` and only consults a custom backoffStrategy
 * when the job asks for `backoff: { type: 'custom' }`. So with the add-options copied
 * 100% verbatim, a retryable error is never retried, the supplied backoffStrategy is
 * never called, §4.3's retryable column is dead, and the `throw e` leaves the row
 * stranded at status='running' forever. The blueprint's own stated behavior is
 * unreachable from its own code — the same defect class as the §6.1 one in
 * VHE-ISSUE-LOG-0013, which the owner ruled on.
 *
 * The owner is unavailable this session and delegated decisions to the builder, so
 * this is enacted as a DELEGATED ruling rather than silently left broken or silently
 * "fixed". `attempts: 3` is not invented — it is the number §4.2's own guard
 * (`row.attempt < 3`) tests against. Revert = delete RETRY_POLICY from the spread.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Queue, JobsOptions } from 'bullmq';
import type { JobType } from '../jobs/create.ts';
import { getConnection } from './connection.ts';

/** Every §4 queue name. One queue per JobType; the queue name IS the type string. */
export const JOB_TYPES = [
  'ingest.probe',
  'generate.image',
  'inpaint.image',
  'track.mask',
  'repair.range',
  'generate.segment',
  'stitch',
  'export',
] as const satisfies readonly JobType[];

/**
 * BUILDER (VHE-ISSUE-LOG-0017): makes §4.2's retry branch and backoffStrategy reachable.
 * `attempts: 3` matches §4.2's own `row.attempt < 3` guard; 'custom' routes to the
 * verbatim backoffStrategy in runtime.ts. Not part of the §4.1 verbatim options.
 */
export const RETRY_POLICY: JobsOptions = {
  attempts: 3,
  backoff: { type: 'custom' },
};

const queues = new Map<JobType, Queue>();

/** Lazily construct (and memoize) the Queue for a type. */
export async function getQueue(type: JobType): Promise<Queue> {
  const existing = queues.get(type);
  if (existing) return existing;
  const connection = await getConnection();
  const { Queue } = await import('bullmq');
  const q = new Queue(type, { connection });
  queues.set(type, q);
  return q;
}

/**
 * The production `deps.enqueue` for §4.1 createJob. Verbatim shape:
 * `queues[type].add(type, { jobId }, { jobId })` — the `jobId` job-option is BullMQ's
 * own dedupe, which §4.1 calls the "second safety net" (the primary guarantee is the
 * DB idempotency claim, already proven live in VHE-ISSUE-LOG-0015).
 */
export async function enqueue(type: JobType, jobId: string): Promise<void> {
  const q = await getQueue(type);
  await q.add(type, { jobId }, { jobId, ...RETRY_POLICY });
}

/** Close every constructed Queue (tests / graceful shutdown). */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
