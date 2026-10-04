import { normalizeForSearch } from './normalize-for-search';

describe('normalizeForSearch', () => {
  it.each([
    ['accented vowels', 'Björk Café', 'bjork cafe'],
    ['ñ', 'Mañana', 'manana'],
    ['plus signs', 'half+me++band', 'half me band'],
    ['multiple whitespace characters', 'A   B\tC\nD', 'a b c d'],
    ['leading and trailing whitespace', '  Artist Name  ', 'artist name'],
    ['uppercase letters', 'METALLICA', 'metallica'],
    ['an already normalized value', 'metallica', 'metallica'],
    ['combined transformations', '  BjóRk++  MAÑANA  ', 'bjork manana'],
  ])('normalizes %s', (_label, input, expected) => {
    expect(normalizeForSearch(input)).toBe(expected);
  });

  it('uses Unicode Diacritic matching after NFD normalization', () => {
    expect(normalizeForSearch('A\u1AB0 B')).toBe('a b');
  });
});
