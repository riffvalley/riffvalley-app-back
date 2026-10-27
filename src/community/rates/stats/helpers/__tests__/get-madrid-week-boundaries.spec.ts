import { getMadridWeekBoundaries } from '../get-madrid-week-boundaries';

describe('getMadridWeekBoundaries', () => {
  it.each([
    [new Date('2026-10-27T12:00:00.000Z'), '2026-10-25T23:00:00.000Z'],
    [new Date('2026-03-25T12:00:00.000Z'), '2026-03-22T23:00:00.000Z'],
  ])('uses Madrid Monday midnight for %s', (referenceDate, expectedStart) => {
    const bounds = getMadridWeekBoundaries(referenceDate);
    expect(bounds.start.toISOString()).toBe(expectedStart);
  });

  it('uses a half-open Monday-to-Monday interval across month and year changes', () => {
    const december = getMadridWeekBoundaries(new Date('2025-12-31T12:00:00Z'));
    expect(december.start.toISOString()).toBe('2025-12-28T23:00:00.000Z');
    expect(december.endExclusive.toISOString()).toBe(
      '2026-01-04T23:00:00.000Z',
    );
    expect(december.previousStart.toISOString()).toBe(
      '2025-12-21T23:00:00.000Z',
    );
  });

  it('resolves the Madrid spring DST week to 167 elapsed hours', () => {
    const bounds = getMadridWeekBoundaries(new Date('2026-03-25T12:00:00Z'));
    expect(bounds.start.toISOString()).toBe('2026-03-22T23:00:00.000Z');
    expect(bounds.endExclusive.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(bounds.endExclusive.getTime() - bounds.start.getTime()).toBe(
      167 * 60 * 60 * 1000,
    );
  });

  it('resolves the Madrid autumn DST week to 169 elapsed hours', () => {
    const bounds = getMadridWeekBoundaries(new Date('2026-10-22T12:00:00Z'));
    expect(bounds.start.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(bounds.endExclusive.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(bounds.endExclusive.getTime() - bounds.start.getTime()).toBe(
      169 * 60 * 60 * 1000,
    );
  });

  it('rejects an invalid reference date', () => {
    expect(() => getMadridWeekBoundaries(new Date(Number.NaN))).toThrow(
      'A valid reference date is required',
    );
  });
});
