type HomeDateRangeClause = 'WHERE' | 'AND';

/** Builds the shared Home release-date fragment and its Date bind values. */
export function buildHomeDateRange(
  clause: HomeDateRangeClause,
  dateRange?: (string | Date)[],
): { condition: string; params: [Date, Date] | [] } {
  if (dateRange?.length !== 2) {
    return { condition: '', params: [] };
  }

  return {
    condition: `${clause === 'WHERE' ? 'WHERE' : ' AND'} d."releaseDate" BETWEEN $1 AND $2`,
    params: [new Date(dateRange[0]), new Date(dateRange[1])],
  };
}
