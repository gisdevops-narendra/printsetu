import { PrintJobStatus } from '@prisma/client';
import { ALLOWED_TRANSITIONS, canTransition } from './print-job-state-machine';

describe('print-job-state-machine (SRS §13.4)', () => {
  it('allows the documented happy path', () => {
    const happyPath: PrintJobStatus[] = [
      'CREATED',
      'PRINT_ELIGIBLE',
      'QUEUED',
      'PRINTING',
      'PRINTED',
      'RETENTION_PENDING',
      'DELETED',
    ];
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('allows the documented failure paths', () => {
    expect(canTransition('QUEUED', 'AGENT_OFFLINE')).toBe(true);
    expect(canTransition('QUEUED', 'PRINT_FAILED')).toBe(true);
    expect(canTransition('PRINTING', 'PRINT_FAILED')).toBe(true);
    expect(canTransition('PRINTING', 'PRINT_UNKNOWN')).toBe(true);
    expect(canTransition('PRINT_UNKNOWN', 'PRINTED')).toBe(true);
    expect(canTransition('PRINT_UNKNOWN', 'PRINT_FAILED')).toBe(true);
    expect(canTransition('AGENT_OFFLINE', 'QUEUED')).toBe(true);
    expect(canTransition('PRINT_FAILED', 'QUEUED')).toBe(true);
  });

  it('never allows skipping straight to PRINTED from PRINT_ELIGIBLE', () => {
    expect(canTransition('PRINT_ELIGIBLE', 'PRINTED')).toBe(false);
  });

  it('never allows resurrecting a DELETED or CANCELLED job', () => {
    expect(ALLOWED_TRANSITIONS.DELETED).toHaveLength(0);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toHaveLength(0);
    expect(canTransition('DELETED', 'QUEUED')).toBe(false);
    expect(canTransition('CANCELLED', 'PRINT_ELIGIBLE')).toBe(false);
  });

  it('never allows a document to be deleted from a state other than RETENTION_PENDING', () => {
    const nonRetentionStates = Object.keys(ALLOWED_TRANSITIONS).filter(
      (s) => s !== 'RETENTION_PENDING',
    ) as PrintJobStatus[];
    for (const state of nonRetentionStates) {
      expect(canTransition(state, 'DELETED')).toBe(false);
    }
  });

  it('rejects an unknown/garbage transition', () => {
    expect(canTransition('PRINTED' as PrintJobStatus, 'QUEUED')).toBe(false);
  });
});
