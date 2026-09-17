import { DOCUMENT_ALLOWED_TRANSITIONS, canTransitionDocument } from './document-status-machine';

describe('document-status-machine (SRS §9 upload/processing stage)', () => {
  it('allows the documented happy path', () => {
    expect(canTransitionDocument('UPLOADED', 'PROCESSING')).toBe(true);
    expect(canTransitionDocument('PROCESSING', 'PROCESSED')).toBe(true);
  });

  it('allows a failed analysis to be requeued for another attempt', () => {
    expect(canTransitionDocument('PROCESSING', 'ANALYSIS_FAILED')).toBe(true);
    expect(canTransitionDocument('ANALYSIS_FAILED', 'PROCESSING')).toBe(true);
  });

  it('never allows skipping straight from UPLOADED to PROCESSED', () => {
    expect(canTransitionDocument('UPLOADED', 'PROCESSED')).toBe(false);
  });

  it('never allows a terminal PROCESSED/PRINT_ELIGIBLE/DELETED document back into analysis', () => {
    expect(DOCUMENT_ALLOWED_TRANSITIONS.PROCESSED).toHaveLength(0);
    expect(DOCUMENT_ALLOWED_TRANSITIONS.PRINT_ELIGIBLE).toHaveLength(0);
    expect(DOCUMENT_ALLOWED_TRANSITIONS.DELETED).toHaveLength(0);
    expect(canTransitionDocument('PROCESSED', 'PROCESSING')).toBe(false);
    expect(canTransitionDocument('DELETED', 'PROCESSING')).toBe(false);
  });

  it('rejects an unknown/garbage transition', () => {
    expect(canTransitionDocument('UPLOADED', 'ANALYSIS_FAILED')).toBe(false);
  });
});
