import {
  buildMusicNamePartialPredicate,
  escapeLikeLiteral,
  getMusicNameContainsPatterns,
  getMusicNameSearchKeys,
} from '../music-name-search';

describe('music-name-search', () => {
  it('matches names independently of the supported musical characters', () => {
    expect(getMusicNameContainsPatterns('MOL')).toContain('%mol%');
    expect(getMusicNameContainsPatterns('Solstafir')).toContain('%solstafir%');
    expect(getMusicNameContainsPatterns('Motorhead')).toContain('%motorhead%');
    expect(getMusicNameContainsPatterns('Bjork')).toContain('%bjork%');
    expect(getMusicNameContainsPatterns('Dodsrit')).toContain('%dodsrit%');
  });

  it('creates only the bounded initial article alternatives', () => {
    expect(getMusicNameSearchKeys('Secrets of Pandora')).toEqual([
      'secrets of pandora',
      'the secrets of pandora',
      'a secrets of pandora',
      'an secrets of pandora',
    ]);
    expect(getMusicNameSearchKeys('The Secrets of Pandora')).toEqual([
      'the secrets of pandora',
      'secrets of pandora',
      'a secrets of pandora',
      'an secrets of pandora',
    ]);
    expect(getMusicNameSearchKeys('Secrets of The Pandora')).toHaveLength(4);
    expect(getMusicNameContainsPatterns('Secrets of Pandora')).toEqual([
      '%secrets of pandora%',
    ]);
    expect(getMusicNameContainsPatterns('The Secrets of Pandora')).toEqual([
      '%the secrets of pandora%',
      '%secrets of pandora%',
    ]);
  });

  it('escapes LIKE metacharacters as literal characters', () => {
    expect(escapeLikeLiteral('50%_\\')).toBe('50\\%\\_\\\\');
    const search = buildMusicNamePartialPredicate(
      'Echo_%',
      'artist.search_name_normalized',
      'artist.name_normalized',
      'echo_%',
    );
    expect(search.parameters.musicSearchLegacy).toBe('%echo\\_\\%%');
    expect(search.predicate).toContain("ESCAPE '\\'");
  });

  it('returns a false predicate when normalization removes the whole input', () => {
    expect(getMusicNameContainsPatterns('%_\\')).toEqual([]);
    expect(
      buildMusicNamePartialPredicate(
        '%_\\',
        'artist.search_name_normalized',
        'artist.name_normalized',
        '',
      ),
    ).toEqual({ predicate: '1 = 0', parameters: {} });
  });
});
