import { buildDiscSuggestionQuery } from '../build-disc-suggestion-query';

describe('buildDiscSuggestionQuery', () => {
  it('builds bounded normalized keys and keeps legacy values for NULL rows', () => {
    const query = buildDiscSuggestionQuery([
      { id: 'release-1', discName: 'Secrets of Pandora', artistName: 'MOL' },
    ]);

    expect(query.parameters).toEqual([
      ['release-1'],
      ['Secrets of Pandora'],
      ['MOL'],
      [
        JSON.stringify([
          'secrets of pandora',
          'the secrets of pandora',
          'a secrets of pandora',
          'an secrets of pandora',
        ]),
      ],
      [JSON.stringify(['mol', 'the mol', 'a mol', 'an mol'])],
    ]);
    expect(query.sql).toContain('search_name_normalized = ANY');
    expect(query.sql).toContain('search_name_normalized IS NULL');
    expect(query.sql).toContain(
      'LOWER(disc.name) = LOWER(requested."discName")',
    );
    expect(query.sql).toContain('LIMIT 1');
    expect(query.sql).not.toContain('ORDER BY');
  });

  it('does not fall back to an unrestricted match for inputs normalized to empty', () => {
    const query = buildDiscSuggestionQuery([
      { id: 'release-1', discName: '%_\\', artistName: 'Artist' },
    ]);

    expect(query.parameters[3]).toEqual(['[]']);
    expect(query.sql).toContain(
      'jsonb_array_length(requested."discKeys"::jsonb) > 0',
    );
  });
});
