import { getLocalYearInstantBounds } from '../local-year-instant-bounds';

describe('getLocalYearInstantBounds', () => {
  it.each([
    ['UTC', '2027-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z'],
    ['Europe/Madrid', '2026-12-31T23:00:00.000Z', '2027-12-31T23:00:00.000Z'],
    [
      'America/Los_Angeles',
      '2027-01-01T08:00:00.000Z',
      '2028-01-01T08:00:00.000Z',
    ],
    [
      'Pacific/Kiritimati',
      '2026-12-31T10:00:00.000Z',
      '2027-12-31T10:00:00.000Z',
    ],
  ])('resolves %s year boundaries to UTC instants', (timeZone, start, end) => {
    const bounds = getLocalYearInstantBounds(2027, timeZone);
    expect(bounds.start.toISOString()).toBe(start);
    expect(bounds.end.toISOString()).toBe(end);
  });

  it('uses the UTC instants of Madrid local New Year boundaries', () => {
    const bounds = getLocalYearInstantBounds(2027, 'Europe/Madrid');
    expect(bounds.start.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2027-12-31T23:00:00.000Z');
  });
});
