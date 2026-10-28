import {
  buildDiscReleaseDatePredicate,
  isTopDiscCountryId,
  resolveTopDiscCountryFilter,
} from './top-disc-predicates';

type HomeDiscFilterInput = {
  userId: string | number;
  dateRange?: (string | Date)[];
  genreId?: string;
  country?: string;
  countryId?: string;
  today: Date;
};

type HomeDiscFilters = {
  mainWhere: string;
  mainParams: unknown[];
};

/** Builds the presentation filters used only to select ranking candidates. */
export function buildHomeDiscFilters({
  userId,
  dateRange,
  genreId,
  country,
  countryId,
  today,
}: HomeDiscFilterInput): HomeDiscFilters {
  const predicates: {
    sql: (firstParameter: number) => string;
    values: unknown[];
  }[] = [];
  const countryFilter = resolveTopDiscCountryFilter(country, countryId);

  predicates.push(buildDiscReleaseDatePredicate(dateRange, today));

  if (genreId) {
    predicates.push({
      sql: (firstParameter) => `d."genreId" = $${firstParameter}`,
      values: [genreId],
    });
  }

  if (countryFilter) {
    const isUUID = isTopDiscCountryId(countryFilter);
    predicates.push({
      sql: (firstParameter) =>
        `${isUUID ? 'c.id' : 'c.name'} = $${firstParameter}`,
      values: [countryFilter],
    });
  }

  const buildWhere = () => {
    let nextParameter = 2;
    const conditions = predicates.map(({ sql, values }) => {
      const condition = sql(nextParameter);
      nextParameter += values.length;
      return condition;
    });
    return `WHERE ${conditions.join(' AND ')}`;
  };

  const filterParams = predicates.flatMap(({ values }) => values);

  return {
    mainWhere: buildWhere(),
    mainParams: [userId, ...filterParams],
  };
}
