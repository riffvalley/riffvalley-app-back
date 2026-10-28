import { TopDiscOptionsQueryDto } from '../../dto/top-disc-options-query.dto';
import {
  buildDiscReleaseDatePredicate,
  buildTopDiscEligibilityPredicate,
  isTopDiscCountryId,
  resolveTopDiscCountryFilter,
} from '../helpers/top-disc-predicates';
import { HomeQueryRunner } from './home-query-runner';
import { DiscTopOptionsResult } from '../types/disc-top-options';
import { CURRENT_RATES_CTE } from './home-global-stats';

type TopDiscOptionsQuery = {
  sql: string;
  params: unknown[];
};

export function buildTopDiscOptionsQuery(
  query: TopDiscOptionsQueryDto,
  today: Date,
): TopDiscOptionsQuery {
  const datePredicate = buildDiscReleaseDatePredicate(query.dateRange, today);
  const params = [...datePredicate.values];
  const countryFilter = resolveTopDiscCountryFilter(
    query.country,
    query.countryId,
  );

  let countriesFilter = '';
  if (query.genreId) {
    params.push(query.genreId);
    countriesFilter = `WHERE ed."genreId" = $${params.length}`;
  }

  let genresFilter = '';
  if (countryFilter) {
    params.push(countryFilter);
    const countryColumn = isTopDiscCountryId(countryFilter) ? 'c.id' : 'c.name';
    genresFilter = `WHERE ${countryColumn} = $${params.length}`;
  }

  return {
    sql: `
      WITH ${CURRENT_RATES_CTE},
      eligible_discs AS (
        SELECT d.id, d."artistId", d."genreId"
        FROM disc d
        WHERE ${datePredicate.sql(1)}
          AND ${buildTopDiscEligibilityPredicate('d')}
      ),
      country_options AS (
        SELECT DISTINCT
          c.id,
          c.name,
          c."isoCode"
        FROM eligible_discs ed
        INNER JOIN artist a ON a.id = ed."artistId"
        INNER JOIN country c ON c.id = a."countryId"
        ${countriesFilter}
      ),
      genre_options AS (
        SELECT DISTINCT
          g.id,
          g.name,
          g.color
        FROM eligible_discs ed
        INNER JOIN genre g ON g.id = ed."genreId"
        LEFT JOIN artist a ON a.id = ed."artistId"
        LEFT JOIN country c ON c.id = a."countryId"
        ${genresFilter}
      )
      SELECT
        'country'::text AS dimension,
        id::text AS id,
        name,
        "isoCode",
        NULL::varchar AS color
      FROM country_options
      UNION ALL
      SELECT
        'genre'::text AS dimension,
        id::text AS id,
        name,
        NULL::varchar AS "isoCode",
        color
      FROM genre_options
      ORDER BY dimension ASC, name ASC, id ASC
    `,
    params,
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`TopDiscs option row has invalid ${field}`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, field);
}

export async function loadTopDiscOptions(
  queryRunner: HomeQueryRunner,
  query: TopDiscOptionsQueryDto,
  today: Date,
): Promise<DiscTopOptionsResult> {
  const builtQuery = buildTopDiscOptionsQuery(query, today);
  const rows = await queryRunner.query(builtQuery.sql, builtQuery.params);
  const result: DiscTopOptionsResult = { countries: [], genres: [] };

  for (const row of rows) {
    const id = requiredString(row.id, 'id');
    const name = requiredString(row.name, 'name');

    if (row.dimension === 'country') {
      result.countries.push({
        id,
        name,
        isoCode: nullableString(row.isoCode, 'isoCode'),
      });
    } else if (row.dimension === 'genre') {
      result.genres.push({
        id,
        name,
        color: nullableString(row.color, 'color'),
      });
    } else {
      throw new TypeError('TopDiscs option row has invalid dimension');
    }
  }

  return result;
}
