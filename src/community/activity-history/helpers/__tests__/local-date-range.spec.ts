import { resolveLocalDateRange } from '../local-date-range';

describe('resolveLocalDateRange', () => {
  it.each([
    ['2026-03-29', 'Europe/Madrid', 23],
    ['2026-10-25', 'Europe/Madrid', 25],
  ])('resolves %s in %s to a %s-hour day', (day, timeZone, hours) => {
    const range = resolveLocalDateRange(day, day, timeZone);
    const duration =
      (range.toExclusiveInstant?.getTime() ?? 0) -
      (range.fromInstant?.getTime() ?? 0);

    expect(duration).toBe(hours * 60 * 60 * 1000);
  });

  it('resolves an exclusive upper bound using the next local calendar day', () => {
    const range = resolveLocalDateRange(
      '2026-10-24',
      '2026-10-25',
      'Europe/Madrid',
    );

    expect(range.fromInstant?.toISOString()).toBe('2026-10-23T22:00:00.000Z');
    expect(range.toExclusiveInstant?.toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
  });

  it('rejects omitted local dates and invalid calendar dates', () => {
    expect(() =>
      resolveLocalDateRange('2011-12-30', '2011-12-30', 'Pacific/Apia'),
    ).toThrow('does not exist');
    expect(() =>
      resolveLocalDateRange('2026-02-30', undefined, 'Europe/Madrid'),
    ).toThrow('supported calendar range');
  });

  it('requires an IANA zone and rejects a reversed range', () => {
    expect(() =>
      resolveLocalDateRange('2026-01-01', undefined, undefined),
    ).toThrow('IANA time zone is required');
    expect(() =>
      resolveLocalDateRange('2026-01-02', '2026-01-01', 'Europe/Madrid'),
    ).toThrow('on or before');
  });
});
