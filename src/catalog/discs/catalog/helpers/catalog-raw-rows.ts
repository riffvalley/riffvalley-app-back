export interface CatalogRawRow {
  disc_id_for_mapping?: string;
  discId?: string;
  disc_id?: string;
  averagerate: string | null;
  averageCover: string | null;
  rateCount: string | null;
  commentCount: string | null;
}

export function indexCatalogRawRows(rawRows: CatalogRawRow[]) {
  return new Map(
    rawRows.map((row) => [
      row.disc_id_for_mapping ?? row.discId ?? row.disc_id!,
      row,
    ]),
  );
}
