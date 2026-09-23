import { AvailabilitySettings, OpeningHours, effectiveAvailability, overrideFor, scheduledStatus } from './shop-availability';

const TZ = 'Asia/Kolkata'; // UTC+05:30

/** Mon–Sat 09:00–18:00, closed Sunday. */
const HOURS: OpeningHours = {
  mon: { open: true, from: '09:00', to: '18:00' },
  tue: { open: true, from: '09:00', to: '18:00' },
  wed: { open: true, from: '09:00', to: '18:00' },
  thu: { open: true, from: '09:00', to: '18:00' },
  fri: { open: true, from: '09:00', to: '18:00' },
  sat: { open: true, from: '09:00', to: '18:00' },
  sun: { open: false, from: '09:00', to: '18:00' },
};

/** A wall-clock time in Kolkata as a UTC instant, e.g. ist('2026-09-24', '10:00'). */
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

const settings = (over: Partial<AvailabilitySettings> = {}): AvailabilitySettings => ({
  acceptingOrders: true,
  autoSchedule: true,
  scheduleOverride: null,
  scheduleOverrideUntil: null,
  ...over,
});

describe('shop availability (daily Online/Offline scheduler)', () => {
  // 2026-09-24 is a Thursday; 2026-09-26 a Saturday; 2026-09-27 a Sunday.

  describe('scheduledStatus', () => {
    it('is open during the day, changing at closing time', () => {
      expect(scheduledStatus(HOURS, ist('2026-09-24', '10:00'), TZ)).toEqual({ open: true, nextChangeAt: ist('2026-09-24', '18:00') });
    });

    it('is closed before opening, changing at opening time', () => {
      expect(scheduledStatus(HOURS, ist('2026-09-24', '07:30'), TZ)).toEqual({ open: false, nextChangeAt: ist('2026-09-24', '09:00') });
    });

    it('treats closing time itself as closed', () => {
      expect(scheduledStatus(HOURS, ist('2026-09-24', '18:00'), TZ).open).toBe(false);
    });

    it('skips a closed day: Saturday evening opens again on Monday morning', () => {
      expect(scheduledStatus(HOURS, ist('2026-09-26', '19:00'), TZ)).toEqual({ open: false, nextChangeAt: ist('2026-09-28', '09:00') });
    });

    it('uses the shop time zone, not UTC (04:00 UTC is 09:30 in Kolkata)', () => {
      expect(scheduledStatus(HOURS, new Date('2026-09-24T04:00:00Z'), TZ).open).toBe(true);
    });

    it('never changes when no day is open', () => {
      const closed = Object.fromEntries(Object.entries(HOURS).map(([d, h]) => [d, { ...h, open: false }])) as OpeningHours;
      expect(scheduledStatus(closed, ist('2026-09-24', '10:00'), TZ)).toEqual({ open: false, nextChangeAt: null });
    });
  });

  describe('effectiveAvailability', () => {
    it('follows the manual switch while the schedule is off', () => {
      const result = effectiveAvailability(settings({ autoSchedule: false, acceptingOrders: false }), HOURS, ist('2026-09-24', '10:00'), TZ);
      expect(result).toEqual({ online: false, source: 'MANUAL', nextChangeAt: null });
    });

    it('follows the opening hours while the schedule is on', () => {
      expect(effectiveAvailability(settings(), HOURS, ist('2026-09-24', '10:00'), TZ).online).toBe(true);
      expect(effectiveAvailability(settings(), HOURS, ist('2026-09-24', '20:00'), TZ).online).toBe(false);
    });

    it('applies a manual break until it ends, then returns to the schedule', () => {
      const lunch = settings({ scheduleOverride: false, scheduleOverrideUntil: ist('2026-09-24', '18:00') });
      expect(effectiveAvailability(lunch, HOURS, ist('2026-09-24', '13:00'), TZ)).toEqual({
        online: false,
        source: 'OVERRIDE',
        nextChangeAt: ist('2026-09-24', '18:00'),
      });
      // Next morning the forgotten break no longer applies.
      expect(effectiveAvailability(lunch, HOURS, ist('2026-09-25', '10:00'), TZ)).toEqual(
        expect.objectContaining({ online: true, source: 'SCHEDULE' }),
      );
    });

    it('falls back to the manual switch when no hours are set', () => {
      expect(effectiveAvailability(settings({ acceptingOrders: false }), null, ist('2026-09-24', '10:00'), TZ).source).toBe('MANUAL');
    });
  });

  describe('overrideFor (flipping the header switch while the schedule is on)', () => {
    it('going offline during open hours lasts until closing time', () => {
      expect(overrideFor(false, HOURS, ist('2026-09-24', '13:00'), TZ)).toEqual({
        scheduleOverride: false,
        scheduleOverrideUntil: ist('2026-09-24', '18:00'),
      });
    });

    it('going online after hours (staying open late) lasts until the next opening', () => {
      expect(overrideFor(true, HOURS, ist('2026-09-24', '19:00'), TZ)).toEqual({
        scheduleOverride: true,
        scheduleOverrideUntil: ist('2026-09-25', '09:00'),
      });
    });

    it('switching back to what the schedule says clears the override', () => {
      expect(overrideFor(true, HOURS, ist('2026-09-24', '14:00'), TZ)).toEqual({ scheduleOverride: null, scheduleOverrideUntil: null });
    });
  });
});
