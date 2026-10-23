import { describe, expect, it } from 'vitest';
import { isWithinAccessHours, localSecondsOfDay } from '../../src/common/utils/access-hours.js';

const HOURS = { start: '07:00', end: '21:00', tz: 'Asia/Jakarta' };

// WIB = UTC+7, no DST.
describe('isWithinAccessHours — [START, END) in Asia/Jakarta', () => {
  it('06:59:59 WIB → deny (before window)', () => {
    expect(isWithinAccessHours(new Date('2025-12-31T23:59:59Z'), HOURS)).toBe(false);
  });

  it('07:00:00 WIB → allow (START inclusive)', () => {
    expect(isWithinAccessHours(new Date('2026-01-01T00:00:00Z'), HOURS)).toBe(true);
  });

  it('20:59:59 WIB → allow (last second before END)', () => {
    expect(isWithinAccessHours(new Date('2026-01-01T13:59:59Z'), HOURS)).toBe(true);
  });

  it('21:00:00 WIB → deny (END exclusive)', () => {
    expect(isWithinAccessHours(new Date('2026-01-01T14:00:00Z'), HOURS)).toBe(false);
  });

  it('wraps past midnight when START > END', () => {
    const night = { start: '22:00', end: '02:00', tz: 'Asia/Jakarta' };
    // 23:00 WIB → allow
    expect(isWithinAccessHours(new Date('2026-01-01T16:00:00Z'), night)).toBe(true);
    // 01:30 WIB → allow
    expect(isWithinAccessHours(new Date('2025-12-31T18:30:00Z'), night)).toBe(true);
    // 07:00 WIB → deny
    expect(isWithinAccessHours(new Date('2026-01-01T00:00:00Z'), night)).toBe(false);
  });

  it('localSecondsOfDay converts UTC instants to WIB seconds', () => {
    expect(localSecondsOfDay(new Date('2026-01-01T00:00:00Z'), 'Asia/Jakarta')).toBe(7 * 3600);
    expect(localSecondsOfDay(new Date('2026-01-01T17:00:00Z'), 'Asia/Jakarta')).toBe(0);
  });
});
