import { normalizeImportArtistName } from './normalize-import-artist-name';

describe('normalizeImportArtistName', () => {
  it('removes accents and the tilde from ñ', () => {
    expect(normalizeImportArtistName('Árbol de Ñandú')).toBe('arbol de nandu');
  });

  it('trims leading and trailing spaces', () => {
    expect(normalizeImportArtistName('   Artist Name   ')).toBe('artist name');
  });

  it('collapses runs of internal whitespace into one space', () => {
    expect(normalizeImportArtistName('Artist\t  Name\nGroup')).toBe('artist name group');
  });

  it('converts uppercase and mixed-case input to lowercase', () => {
    expect(normalizeImportArtistName('bLAcK SABBATH')).toBe('black sabbath');
  });

  it('leaves characters without diacritics intact apart from case and spaces', () => {
    expect(normalizeImportArtistName('KISS  2')).toBe('kiss 2');
  });
});
