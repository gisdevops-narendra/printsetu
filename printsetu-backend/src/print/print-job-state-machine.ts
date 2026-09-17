import { PrintJobStatus } from '@prisma/client';

/**
 * SRS §13.4: CREATED -> PRINT_ELIGIBLE -> QUEUED -> PRINTING -> PRINTED ->
 * RETENTION_PENDING -> DELETED, with PRINT_FAILED / AGENT_OFFLINE /
 * PRINT_UNKNOWN failure paths. "Transitions must be validated server-side"
 * — this table is the single source of truth for what is legal; every
 * write to PrintJob.status must go through PrintJobsRepository.transition
 * below rather than a raw prisma.update.
 */
export const ALLOWED_TRANSITIONS: Record<PrintJobStatus, PrintJobStatus[]> = {
  CREATED: ['PRINT_ELIGIBLE', 'CANCELLED'],
  PRINT_ELIGIBLE: ['QUEUED', 'CANCELLED'],
  QUEUED: ['PRINTING', 'AGENT_OFFLINE', 'PRINT_FAILED'],
  PRINTING: ['PRINTED', 'PRINT_FAILED', 'PRINT_UNKNOWN'],
  PRINT_UNKNOWN: ['PRINTED', 'PRINT_FAILED'],
  AGENT_OFFLINE: ['QUEUED', 'PRINT_FAILED'],
  PRINT_FAILED: ['QUEUED'],
  PRINTED: ['RETENTION_PENDING'],
  RETENTION_PENDING: ['DELETED'],
  DELETED: [],
  CANCELLED: [],
};

export function canTransition(from: PrintJobStatus, to: PrintJobStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
