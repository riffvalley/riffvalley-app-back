import { buildMusicNameSuggestionRank } from '../music-name-suggestion-rank';

describe('buildMusicNameSuggestionRank', () => {
  it('ranks exact, prefix, and partial primary matches before article variants', () => {
    const result = buildMusicNameSuggestionRank('the cure', [
      [{ normalizedColumn: 'artist.search_name_normalized' }],
    ]);

    expect(result.expression.indexOf('= :suggestionRank0 THEN 0')).toBeLessThan(
      result.expression.indexOf("LIKE :suggestionRank1 ESCAPE '\\' THEN 1"),
    );
    expect(result.expression.indexOf('THEN 2')).toBeLessThan(
      result.expression.indexOf('THEN 3'),
    );
    expect(result.expression).toContain(
      'artist.search_name_normalized = :suggestionRank',
    );
    expect(Object.values(result.parameters)).toContain('cure');
    expect(Object.values(result.parameters)).toContain('the cure');
  });

  it('ranks match quality before disc title priority and escapes LIKE patterns', () => {
    const result = buildMusicNameSuggestionRank('100%_', [
      [{ normalizedColumn: 'disc.search_name_normalized' }],
      [{ normalizedColumn: 'artist.search_name_normalized' }],
    ]);

    const artistExact = result.expression.indexOf(
      'artist.search_name_normalized =',
    );
    const titlePrefix = result.expression.indexOf(
      'disc.search_name_normalized LIKE',
    );
    expect(artistExact).toBeLessThan(titlePrefix);
    expect(result.expression).toContain("ESCAPE '\\'");
    expect(Object.values(result.parameters)).toContain('100');
  });
});
