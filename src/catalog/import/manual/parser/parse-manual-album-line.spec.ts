import { parseManualAlbumLine } from './parse-manual-album-line';

describe('parseManualAlbumLine', () => {
  it.each([' - ', ' – '])('parses the artist/disc separator %s and removes a final parenthetical suffix', (separator) => {
    expect(parseManualAlbumLine(`Artist${separator}Album (Deluxe)`)).toEqual({
      kind: 'parsed',
      artistName: 'Artist',
      discName: 'Album',
    });
  });

  it('keeps artist whitespace, trims the disc title, and preserves non-final parentheses', () => {
    expect(parseManualAlbumLine('  Artist Name -  Album (Live) (Deluxe)  ')).toEqual({
      kind: 'parsed',
      artistName: '  Artist Name',
      discName: 'Album (Live)',
    });
  });

  it('marks a re-release case-insensitively wherever the text occurs', () => {
    expect(parseManualAlbumLine('Artist - THE RE-RELEASE edition')).toEqual({ kind: 're-release' });
    expect(parseManualAlbumLine('Re-Release artist – Album')).toEqual({ kind: 're-release' });
  });

  it.each(['Malformed line', ' - Album', 'Artist - '])('marks a malformed line as invalid: %s', (line) => {
    expect(parseManualAlbumLine(line)).toEqual({ kind: 'invalid' });
  });

  it('retains the original first-replacement and first-split behavior for repeated separators', () => {
    expect(parseManualAlbumLine('Artist - Album - Bonus')).toEqual({
      kind: 'parsed',
      artistName: 'Artist',
      discName: 'Album - Bonus',
    });
  });
});
