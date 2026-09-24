import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { timeAgo } from './header.models';
import { provideEnglishTranslations } from '../../../../testing/english-translations';

describe('timeAgo (header notification timestamps)', () => {
  const now = new Date('2026-09-19T12:00:00Z').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideEnglishTranslations()] });
    TestBed.inject(TranslateService);
  });

  it('says "just now" inside the first minute', () => {
    expect(timeAgo(ago(20_000), now)).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(timeAgo(ago(5 * 60_000), now)).toBe('5m ago');
    expect(timeAgo(ago(3 * 3600_000), now)).toBe('3h ago');
    expect(timeAgo(ago(2 * 24 * 3600_000), now)).toBe('2d ago');
  });

  it('falls back to a short date after a week', () => {
    expect(timeAgo(ago(10 * 24 * 3600_000), now)).toMatch(/^\d{2} [A-Za-z]{3,4}$/);
  });

  it('never returns a negative age for a timestamp slightly in the future', () => {
    expect(timeAgo(new Date(now + 5_000).toISOString(), now)).toBe('just now');
  });
});
