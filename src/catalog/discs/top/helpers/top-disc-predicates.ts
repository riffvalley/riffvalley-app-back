export type DiscReleaseDatePredicate = {
  sql: (firstParameter: number) => string;
  values: unknown[];
};

export function buildDiscReleaseDatePredicate(
  dateRange: (string | Date)[] | undefined,
  today: Date,
): DiscReleaseDatePredicate {
  if (dateRange?.length === 2) {
    return {
      sql: (firstParameter) =>
        `d."releaseDate" BETWEEN $${firstParameter} AND $${firstParameter + 1} AND d."releaseDate" <= $${firstParameter + 2}`,
      values: [new Date(dateRange[0]), new Date(dateRange[1]), today],
    };
  }

  return {
    sql: (firstParameter) => `d."releaseDate" <= $${firstParameter}`,
    values: [today],
  };
}

export function buildTopDiscEligibilityPredicate(discAlias = 'd'): string {
  return `EXISTS (
    SELECT 1
    FROM valid_current_rates eligible_rate
    WHERE eligible_rate."discId" = ${discAlias}.id
  )`;
}

export function isTopDiscCountryId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function resolveTopDiscCountryFilter(
  country?: string,
  countryId?: string,
): string | undefined {
  return country || countryId;
}
