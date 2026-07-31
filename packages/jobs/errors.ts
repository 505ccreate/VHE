/**
 * VHE-2 §4.3 — Error taxonomy. Machine codes the UI switches on, never message
 * strings. Transcribed verbatim from the §4.3 table in
 * VHE-2_THE_Work_Order_Plan_v3_7-17-2026.docx.
 */

export type ErrorCode =
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_REJECTED'
  | 'NO_PROVIDER'
  | 'BUDGET_EXCEEDED'
  | 'MEDIA_CORRUPT'
  | 'INTERNAL';

/** §4.3 retryability, verbatim from the table (INTERNAL is "yes ×1"). */
export const ERROR_TAXONOMY: Record<ErrorCode, { retryable: boolean; meaning: string }> = {
  PROVIDER_RATE_LIMIT: { retryable: true, meaning: '429 from provider — backoff and retry' },
  PROVIDER_TIMEOUT: { retryable: true, meaning: 'provider poll exceeded deadline' },
  PROVIDER_REJECTED: { retryable: false, meaning: 'provider refused input (content policy, bad params)' },
  NO_PROVIDER: { retryable: false, meaning: 'routing found no eligible connection for the capability' },
  BUDGET_EXCEEDED: { retryable: false, meaning: 'owner spend cap hit' },
  MEDIA_CORRUPT: { retryable: false, meaning: 'probe/decode failure on source' },
  INTERNAL: { retryable: true, meaning: 'anything unclassified (retryable ×1)' },
};

/** A classified application error carrying a §4.3 machine code. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus?: number;
  constructor(code: ErrorCode, httpStatus?: number, message?: string) {
    super(message ?? ERROR_TAXONOMY[code].meaning);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Map any thrown value to a §4.3 code + retryability. An unrecognized error is
 * INTERNAL (retryable exactly once — the worker enforces the attempt ceiling).
 */
export function classifyError(e: unknown): { code: ErrorCode; retryable: boolean } {
  if (e instanceof ApiError) {
    return { code: e.code, retryable: ERROR_TAXONOMY[e.code].retryable };
  }
  return { code: 'INTERNAL', retryable: ERROR_TAXONOMY.INTERNAL.retryable };
}
