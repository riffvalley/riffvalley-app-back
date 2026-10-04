import { normalizeArtistName } from './normalize-artist-name';

describe('normalizeArtistName', () => {
  it('removes diacritics, lowercases, and trims while preserving internal spaces', () => {
    expect(normalizeArtistName('  Árbol de Ñandú  ')).toBe('arbol de nandu');
  });

  it('leaves an already normalized name unchanged', () => {
    expect(normalizeArtistName('new band')).toBe('new band');
  });
});
