import { formatReleaseDay } from '../format-release-day';

describe('formatReleaseDay', () => {
  it('formats a Date as a calendar date', () => {
    expect(formatReleaseDay(new Date('2026-02-03T00:00:00.000Z'))).toBe(
      '2026-02-03',
    );
  });

  it('preserves a PostgreSQL date returned as a string', () => {
    expect(formatReleaseDay('2026-02-03')).toBe('2026-02-03');
  });
});
