import { parseManualDate } from '../parse-manual-date';

describe('parseManualDate', () => {
  it('parses English month names case-insensitively into a local Date', () => {
    const date = parseManualDate('oCtObEr 4, 2026');

    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(4);
  });

  it('returns null for unrecognized months and malformed values', () => {
    expect(parseManualDate('Not a date')).toBeNull();
    expect(parseManualDate('October')).toBeNull();
    expect(parseManualDate('February NaN, 2026')).toBeNull();
    expect(parseManualDate('October 4, 2026 extra')).toBeNull();
  });

  it.each([
    ['nonexistent day', 'February 31, 2026'],
    ['nonexistent month', 'Undecember 4, 2026'],
    ['non-leap February 29', 'February 29, 2025'],
  ])('rejects a %s', (_description, input) => {
    expect(parseManualDate(input)).toBeNull();
  });

  it('accepts February 29 in a leap year without changing its calendar date', () => {
    const date = parseManualDate('February 29, 2024');

    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(1);
    expect(date?.getDate()).toBe(29);
  });
});
