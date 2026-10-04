export interface CatalogRawRow {
  discId: string;
  averagerate: string | null;
  averageCover: string | null;
  rateCount: string | null;
  commentCount: string | null;
}

export function indexCatalogRawRows(rawRows: CatalogRawRow[]) {
  return new Map(rawRows.map((row) => [row.discId, row]));
}
