import { HomeQueryRunner } from '../loaders/home-query-runner';

export type HomePostgresValue = string | number | boolean | Date | null;

export interface HomePostgresClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(
    sql: string,
    values?: HomePostgresValue[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export function getHomePostgresValues(values: unknown[]): HomePostgresValue[] {
  return values.map((value) => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (value instanceof Date) return value;
    if (value === null) return null;
    throw new TypeError('Unsupported Home PostgreSQL parameter');
  });
}

export function asHomeQueryRunner(client: HomePostgresClient): HomeQueryRunner {
  return {
    query: async (sql, parameters = []) => {
      const result = await client.query(sql, getHomePostgresValues(parameters));
      return result.rows;
    },
  };
}
