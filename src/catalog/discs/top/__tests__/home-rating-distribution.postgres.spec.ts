import {
  HomePostgresClient,
  getHomePostgresValues,
} from './home-postgres-types';
import { HomeQueryRunner } from '../loaders/home-query-runner';
import { loadHomeRatingDistribution } from '../loaders/home-rating-distribution';

const describePostgres =
  process.env.D37_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('loadHomeRatingDistribution with PostgreSQL fixtures', () => {
  let client: HomePostgresClient | null = null;
  const getClient = (): HomePostgresClient => {
    if (!client) throw new Error('PostgreSQL client is not initialized');
    return client;
  };

  beforeAll(async () => {
    const dotenv = await import('dotenv');
    dotenv.config();
    if (process.env.STAGE !== 'dev') {
      throw new Error('D37 PostgreSQL tests require STAGE=dev');
    }

    const { Client } = await import('pg');
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    await getClient().query(`
      CREATE TEMP TABLE disc (id integer PRIMARY KEY, "releaseDate" date);
      CREATE TEMP TABLE rate (
        id integer PRIMARY KEY,
        "discId" integer,
        rate numeric(4, 2)
      );
    `);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await getClient().query('TRUNCATE rate, disc');
    await getClient().query(`
      INSERT INTO disc (id, "releaseDate") VALUES
        (1, DATE '2024-01-01'),
        (2, DATE '2024-12-31'),
        (3, DATE '2023-12-31'),
        (4, NULL),
        (5, DATE '2024-06-30');
      INSERT INTO rate (id, "discId", rate) VALUES
        (1, 1, 4.50),
        (2, 1, 3.75),
        (3, 1, 4.50),
        (4, 1, NULL),
        (5, 2, 2.25),
        (6, 2, 3.75),
        (7, 3, 1.25),
        (8, 4, 5.00),
        (9, 5, 2.25);
    `);
  });

  async function loadDistribution(distributionDateRange?: string[]) {
    let rawRows: Record<string, unknown>[] = [];
    let sql = '';
    let params: unknown[] = [];
    const repository: HomeQueryRunner = {
      query: async (query: string, values: unknown[]) => {
        sql = query;
        params = values;
        const result = await getClient().query(
          query,
          getHomePostgresValues(values),
        );
        rawRows = result.rows;
        return result.rows;
      },
    };
    const result = await loadHomeRatingDistribution(
      repository,
      distributionDateRange,
    );
    return { result, rawRows, sql, params };
  }

  it('groups repeated decimal values in ascending order, ignores NULL rates, and preserves SQL numeric scales', async () => {
    const { result, rawRows, sql, params } = await loadDistribution();

    expect(result).toEqual([
      { rate: 1.25, count: 1 },
      { rate: 2.25, count: 2 },
      { rate: 3.75, count: 2 },
      { rate: 4.5, count: 2 },
      { rate: 5, count: 1 },
    ]);
    expect(rawRows.map(({ rateValue, count }) => [rateValue, count])).toEqual([
      ['1.25', '1'],
      ['2.25', '2'],
      ['3.75', '2'],
      ['4.50', '2'],
      ['5.00', '1'],
    ]);
    expect(
      rawRows.every(
        ({ rateValue, count }) =>
          typeof rateValue === 'string' && typeof count === 'string',
      ),
    ).toBe(true);
    expect(
      result.every(
        ({ rate, count }) =>
          typeof rate === 'number' && typeof count === 'number',
      ),
    ).toBe(true);
    expect(sql).toContain('WHERE r.rate IS NOT NULL');
    expect(sql).toContain('GROUP BY r.rate');
    expect(sql).toContain('ORDER BY r.rate;');
    expect(params).toEqual([]);
  });

  it('applies only distributionDateRange with inclusive boundaries, excluding outside and NULL-date discs', async () => {
    const { result, rawRows, params, sql } = await loadDistribution([
      '2024-01-01',
      '2024-12-31',
    ]);

    expect(result).toEqual([
      { rate: 2.25, count: 2 },
      { rate: 3.75, count: 2 },
      { rate: 4.5, count: 2 },
    ]);
    expect(rawRows.map(({ rateValue }) => rateValue)).toEqual([
      '2.25',
      '3.75',
      '4.50',
    ]);
    expect(params).toEqual([new Date('2024-01-01'), new Date('2024-12-31')]);
    expect(sql).toContain('AND d."releaseDate" BETWEEN $1 AND $2');
  });

  it('returns an empty distribution when there are no rating rows', async () => {
    await getClient().query('TRUNCATE rate');

    await expect(loadDistribution()).resolves.toMatchObject({
      result: [],
      rawRows: [],
    });
  });
});
