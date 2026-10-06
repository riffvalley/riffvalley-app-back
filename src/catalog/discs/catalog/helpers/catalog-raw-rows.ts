export interface CatalogRawRow {
  discId?: string;
  disc_id?: string;
  averagerate: string | null;
  averageCover: string | null;
  rateCount: string | null;
  commentCount: string | null;
}

export function indexCatalogRawRows(rawRows: CatalogRawRow[]) {
  return new Map(rawRows.map((row) => [row.discId ?? row.disc_id!, row]));
}
