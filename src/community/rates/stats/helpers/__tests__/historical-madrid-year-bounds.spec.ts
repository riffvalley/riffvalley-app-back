import { getHistoricalMadridYearBounds } from '../historical-madrid-year-bounds';

describe('getHistoricalMadridYearBounds', () => {
  it.each([
    [
      2025,
      '2025-01-01',
      '2026-01-01',
      '2024-12-31T23:00:00.000Z',
      '2025-12-31T23:00:00.000Z',
    ],
    [
      2026,
      '2026-01-01',
      '2027-01-01',
      '2025-12-31T23:00:00.000Z',
      '2026-12-31T23:00:00.000Z',
    ],
  ])(
    'builds half-open Madrid-local bounds for %i',
    (year, startDate, endDate, startInstant, endInstant) => {
      expect(getHistoricalMadridYearBounds(year)).toEqual({
        releaseDateStart: startDate,
        releaseDateEnd: endDate,
        rateCreatedAtStartLocal: `${startDate} 00:00:00`,
        rateCreatedAtEndLocal: `${endDate} 00:00:00`,
        rateCreatedAtStartInstantUtc: startInstant,
        rateCreatedAtEndInstantUtc: endInstant,
      });
    },
  );

  it.each([2024, 2027, 2025.5])('rejects unsupported year %s', (year) => {
    expect(() => getHistoricalMadridYearBounds(year)).toThrow(RangeError);
  });
});
