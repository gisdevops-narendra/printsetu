import { DocumentStatus } from '@prisma/client';

/**
 * SRS §9 Document Management & Lifecycle, Upload/Processing rows:
 * UPLOADED -> PROCESSING -> PROCESSED | ANALYSIS_FAILED, with a failed
 * analysis eligible for a fresh PROCESSING attempt (automatic BullMQ retry
 * or a future manual re-run). PROCESSED -> PRINT_ELIGIBLE and the retention
 * DELETED transition belong to the print-job/retention lifecycle (SRS
 * §13.4) and are handled there, not by DocumentsRepository.transition.
 * This table only governs the upload/analysis stage.
 */
export const DOCUMENT_ALLOWED_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  UPLOADED: ['PROCESSING'],
  PROCESSING: ['PROCESSED', 'ANALYSIS_FAILED'],
  ANALYSIS_FAILED: ['PROCESSING'],
  PROCESSED: [],
  PRINT_ELIGIBLE: [],
  DELETED: [],
};

export function canTransitionDocument(from: DocumentStatus, to: DocumentStatus): boolean {
  return DOCUMENT_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
