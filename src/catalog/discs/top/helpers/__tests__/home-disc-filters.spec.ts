import { buildHomeDiscFilters } from '../home-disc-filters';

const USER_ID = 'user-17';
const GENRE_ID = 'genre-23';
const COUNTRY_ID = '123e4567-e89b-12d3-a456-426614174000';
const TODAY = new Date('2026-10-04T10:00:00.000Z');

describe('buildHomeDiscFilters', () => {
  it('always limits release dates to today when no dateRange is provided', () => {
    const filters = buildHomeDiscFilters({ userId: USER_ID, today: TODAY });

    expect(filters).toEqual({
      mainWhere: 'WHERE d."releaseDate" <= $2',
      mainParams: [USER_ID, TODAY],
    });
  });

  it('adds genreId after the default date condition', () => {
    const filters = buildHomeDiscFilters({
      userId: USER_ID,
      genreId: GENRE_ID,
      today: TODAY,
    });

    expect(filters.mainWhere).toBe(
      'WHERE d."releaseDate" <= $2 AND d."genreId" = $3',
    );
    expect(filters.mainParams).toEqual([USER_ID, TODAY, GENRE_ID]);
  });

  it('matches UUID country values against c.id and name values against c.name', () => {
    const byId = buildHomeDiscFilters({
      userId: USER_ID,
      countryId: COUNTRY_ID,
      today: TODAY,
    });
    const byName = buildHomeDiscFilters({
      userId: USER_ID,
      country: 'España',
      today: TODAY,
    });

    expect(byId.mainWhere).toContain('c.id = $3');
    expect(byId.mainParams).toEqual([USER_ID, TODAY, COUNTRY_ID]);
    expect(byName.mainWhere).toContain('c.name = $3');
    expect(byName.mainParams).toEqual([USER_ID, TODAY, 'España']);
  });

  it('uses the two dateRange bounds followed by today', () => {
    const filters = buildHomeDiscFilters({
      userId: USER_ID,
      dateRange: ['2020-01-01', '2024-12-31'],
      today: TODAY,
    });

    expect(filters.mainWhere).toBe(
      'WHERE d."releaseDate" BETWEEN $2 AND $3 AND d."releaseDate" <= $4',
    );
    expect(filters.mainParams[1]).toEqual(new Date('2020-01-01'));
    expect(filters.mainParams[2]).toEqual(new Date('2024-12-31'));
    expect(filters.mainParams[3]).toBe(TODAY);
  });

  it('combines date, genre and country filters in their existing bind order', () => {
    const filters = buildHomeDiscFilters({
      userId: USER_ID,
      dateRange: ['2020-01-01', '2024-12-31'],
      genreId: GENRE_ID,
      country: 'España',
      today: TODAY,
    });

    expect(filters.mainWhere).toBe(
      'WHERE d."releaseDate" BETWEEN $2 AND $3 AND d."releaseDate" <= $4 AND d."genreId" = $5 AND c.name = $6',
    );
    expect(filters.mainParams).toEqual([
      USER_ID,
      new Date('2020-01-01'),
      new Date('2024-12-31'),
      TODAY,
      GENRE_ID,
      'España',
    ]);
  });

  it('preserves country precedence and falls back to countryId when country is empty', () => {
    const countryWins = buildHomeDiscFilters({
      userId: USER_ID,
      country: 'España',
      countryId: COUNTRY_ID,
      today: TODAY,
    });
    const countryIdFallback = buildHomeDiscFilters({
      userId: USER_ID,
      country: '',
      countryId: COUNTRY_ID,
      today: TODAY,
    });

    expect(countryWins.mainParams.at(-1)).toBe('España');
    expect(countryWins.mainWhere).toContain('c.name = $3');
    expect(countryIdFallback.mainParams.at(-1)).toBe(COUNTRY_ID);
    expect(countryIdFallback.mainWhere).toContain('c.id = $3');
  });
});
