import { TopDiscOptionsQueryDto } from '../../../dto/top-disc-options-query.dto';
import { HomeQueryRunner } from '../home-query-runner';
import {
  buildTopDiscOptionsQuery,
  loadTopDiscOptions,
} from '../load-top-disc-options';

const TODAY = new Date('2026-10-28T12:00:00.000Z');
const COUNTRY_ID = 'a1234567-89ab-4cde-8123-456789abcdef';
const GENRE_ID = 'b1234567-89ab-4cde-8123-456789abcdef';

describe('buildTopDiscOptionsQuery', () => {
  it('uses one eligible-disc CTE and derives both lists with crossed filters', () => {
    const query = buildTopDiscOptionsQuery(
      Object.assign(new TopDiscOptionsQueryDto(), {
        dateRange: [
          new Date('2026-10-01T00:00:00.000Z'),
          new Date('2026-10-31T00:00:00.000Z'),
        ],
        countryId: COUNTRY_ID,
        genreId: GENRE_ID,
      }),
      TODAY,
    );

    expect(query.sql.match(/eligible_discs AS/g)).toHaveLength(1);
    expect(query.sql).toContain(
      'd."releaseDate" BETWEEN $1 AND $2 AND d."releaseDate" <= $3',
    );
    expect(query.sql).toContain('valid_current_rates eligible_rate');
    expect(query.sql).not.toContain('d."pinned"');
    expect(query.sql).toContain('DISTINCT ON (r."discId", r."userId")');
    expect(query.sql).toContain('WHERE ed."genreId" = $4');
    expect(query.sql).toContain('WHERE c.id = $5');
    expect(query.sql).toContain('UNION ALL');
    expect(query.sql).toContain('ORDER BY dimension ASC, name ASC, id ASC');
    expect(query.sql).not.toContain('weightedScore');
    expect(query.sql).not.toContain('LIMIT');
    expect(query.sql).not.toContain('JOIN rate r');
    expect(query.params).toEqual([
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-31T00:00:00.000Z'),
      TODAY,
      GENRE_ID,
      COUNTRY_ID,
    ]);
  });

  it('uses Todos as releaseDate through today and omits each selector own filter', () => {
    const query = buildTopDiscOptionsQuery(new TopDiscOptionsQueryDto(), TODAY);

    expect(query.sql).toContain('WHERE d."releaseDate" <= $1');
    expect(query.sql).not.toContain('WHERE ed."genreId"');
    expect(query.sql).not.toContain('WHERE c.id');
    expect(query.sql).not.toContain('WHERE c.name');
    expect(query.params).toEqual([TODAY]);
  });

  it('preserves the ranking country string precedence and ID-or-name semantics', () => {
    const byLegacyCountry = buildTopDiscOptionsQuery(
      Object.assign(new TopDiscOptionsQueryDto(), {
        country: 'España',
        countryId: COUNTRY_ID,
      }),
      TODAY,
    );
    const byCountryId = buildTopDiscOptionsQuery(
      Object.assign(new TopDiscOptionsQueryDto(), { countryId: COUNTRY_ID }),
      TODAY,
    );

    expect(byLegacyCountry.sql).toContain('WHERE c.name = $2');
    expect(byLegacyCountry.params).toEqual([TODAY, 'España']);
    expect(byCountryId.sql).toContain('WHERE c.id = $2');
    expect(byCountryId.params).toEqual([TODAY, COUNTRY_ID]);
  });

  it('keeps an inverted range as a bounded empty range instead of Todos', () => {
    const query = buildTopDiscOptionsQuery(
      Object.assign(new TopDiscOptionsQueryDto(), {
        dateRange: [
          new Date('2026-10-20T00:00:00.000Z'),
          new Date('2026-10-01T00:00:00.000Z'),
        ],
      }),
      TODAY,
    );

    expect(query.sql).toContain('BETWEEN $1 AND $2');
    expect(query.params).toEqual([
      new Date('2026-10-20T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
      TODAY,
    ]);
  });
});

describe('loadTopDiscOptions', () => {
  it('maps one SQL result into ordered country and genre arrays', async () => {
    const rows: Record<string, unknown>[] = [
      {
        dimension: 'country',
        id: COUNTRY_ID,
        name: 'Norway',
        isoCode: 'NO',
        color: null,
      },
      {
        dimension: 'genre',
        id: GENRE_ID,
        name: 'Black Metal',
        isoCode: null,
        color: '#445566',
      },
    ];
    const query: jest.MockedFunction<HomeQueryRunner['query']> = jest.fn<
      Promise<Record<string, unknown>[]>,
      Parameters<HomeQueryRunner['query']>
    >(async () => rows);

    await expect(
      loadTopDiscOptions({ query }, new TopDiscOptionsQueryDto(), TODAY),
    ).resolves.toEqual({
      countries: [{ id: COUNTRY_ID, name: 'Norway', isoCode: 'NO' }],
      genres: [{ id: GENRE_ID, name: 'Black Metal', color: '#445566' }],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns empty arrays for a period with no eligible options', async () => {
    const query: jest.MockedFunction<HomeQueryRunner['query']> = jest.fn<
      Promise<Record<string, unknown>[]>,
      Parameters<HomeQueryRunner['query']>
    >(async () => []);

    await expect(
      loadTopDiscOptions({ query }, new TopDiscOptionsQueryDto(), TODAY),
    ).resolves.toEqual({ countries: [], genres: [] });
  });
});
