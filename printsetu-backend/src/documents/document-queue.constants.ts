export const DOCUMENT_ANALYSIS_QUEUE = 'document-analysis';

/** Retry policy for the analysis worker (SRS §10.1/§14: BullMQ-managed retries). */
export const DOCUMENT_ANALYSIS_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: false,
};
