import { BadRequestException } from '@nestjs/common';
import { localDate, resolveDateRange, startOfLocalDay } from './date-range';

describe('date-range (admin dashboard filter, shop time zone)', () => {
  const TZ = 'Asia/Kolkata'; // UTC+05:30

  it('local midnight in IST is 18:30 UTC the previous day', () => {
    expect(startOfLocalDay('2026-09-24', TZ).toISOString()).toBe('2026-09-23T18:30:00.000Z');
  });

  it('reads the local calendar day of an instant', () => {
    expect(localDate(new Date('2026-09-23T19:00:00Z'), TZ)).toBe('2026-09-24');
  });

  it('turns an inclusive day range into a [start, end) window and lists every day', () => {
    const range = resolveDateRange('2026-09-01', '2026-09-03', TZ);

    expect(range.start.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-03T18:30:00.000Z');
    expect(range.days).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('defaults to the current month to date', () => {
    const range = resolveDateRange(undefined, undefined, TZ, new Date('2026-09-24T10:00:00Z'));

    expect(range.from).toBe('2026-09-01');
    expect(range.to).toBe('2026-09-24');
  });

  it('crosses month and year boundaries', () => {
    expect(resolveDateRange('2025-12-30', '2026-01-02', TZ).days).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it.each([
    ['not-a-date', '2026-09-01'],
    ['2026-02-30', '2026-03-01'],
    ['2026-09-10', '2026-09-01'],
    ['2024-01-01', '2026-01-01'],
  ])('rejects %s .. %s', (from, to) => {
    expect(() => resolveDateRange(from, to, TZ)).toThrow(BadRequestException);
  });
});
