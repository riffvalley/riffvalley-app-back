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
  globalWhere: string;
  globalParams: unknown[];
};

/** Builds the equivalent filters used by the home discs and global stats queries. */
export function buildHomeDiscFilters({
  userId,
  dateRange,
  genreId,
  country,
  countryId,
  today,
}: HomeDiscFilterInput): HomeDiscFilters {
  const predicates: { sql: (firstParameter: number) => string; values: unknown[] }[] = [];
  const countryFilter = country || countryId;

  if (dateRange && dateRange.length === 2) {
    predicates.push({
      sql: (firstParameter) =>
        `d."releaseDate" BETWEEN $${firstParameter} AND $${firstParameter + 1} AND d."releaseDate" <= $${firstParameter + 2}`,
      values: [new Date(dateRange[0]), new Date(dateRange[1]), today],
    });
  } else {
    predicates.push({
      sql: (firstParameter) => `d."releaseDate" <= $${firstParameter}`,
      values: [today],
    });
  }

  if (genreId) {
    predicates.push({
      sql: (firstParameter) => `d."genreId" = $${firstParameter}`,
      values: [genreId],
    });
  }

  if (countryFilter) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(countryFilter);
    predicates.push({
      sql: (firstParameter) =>
        `${isUUID ? 'c.id' : 'c.name'} = $${firstParameter}`,
      values: [countryFilter],
    });
  }

  const buildWhere = (parameterOffset: number) => {
    let nextParameter = parameterOffset + 1;
    const conditions = predicates.map(({ sql, values }) => {
      const condition = sql(nextParameter);
      nextParameter += values.length;
      return condition;
    });
    return `WHERE ${conditions.join(' AND ')}`;
  };

  const filterParams = predicates.flatMap(({ values }) => values);

  return {
    mainWhere: buildWhere(1),
    mainParams: [userId, ...filterParams],
    globalWhere: buildWhere(0),
    globalParams: filterParams,
  };
}
