import { normalizeGeography } from '../normalize-geography';

describe('normalizeGeography', () => {
  it('folds case, accents, surrounding whitespace, and repeated spaces deterministically', () => {
    expect(normalizeGeography('  Sépticflesh   European Tour 2027  ')).toBe(
      'septicflesh european tour 2027',
    );
  });

  it('preserves punctuation as part of the catalog normalization contract', () => {
    expect(normalizeGeography('Tour: 2027!')).toBe('tour: 2027!');
  });
});
