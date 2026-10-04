export function mapOptionRows(field: string, rows: Record<string, unknown>[]) {
  if (field === 'year') return rows.map((row) => Number(row.year));
  if (field === 'ep') return rows.map((row) => Boolean(row.ep));
  if (field === 'debut') return rows.map((row) => Boolean(row.debut));
  return rows;
}
