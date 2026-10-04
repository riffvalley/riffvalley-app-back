import { parseManualDate } from './parse-manual-date';

describe('parseManualDate', () => {
  it('parses English month names case-insensitively into a local Date', () => {
    const date = parseManualDate('oCtObEr 4, 2026');

    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(4);
  });

  it('returns null for an unrecognized month while malformed missing fields still throw', () => {
    expect(parseManualDate('Not a date')).toBeNull();
    expect(() => parseManualDate('October')).toThrow(TypeError);
  });

  it('preserves native Date rollover for out-of-range day values', () => {
    const date = parseManualDate('February 31, 2026');

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(3);
  });
});
