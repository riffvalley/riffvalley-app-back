/** Minimal raw-query contract shared by Home loaders and their typed fixtures. */
export interface HomeQueryRunner {
  query(
    query: string,
    parameters?: unknown[],
  ): Promise<Record<string, unknown>[]>;
}

export type HomeSqlValue = string | number | Date | null;
