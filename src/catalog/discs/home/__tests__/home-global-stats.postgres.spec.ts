import { buildHomeDiscFilters } from '../helpers/home-disc-filters';
import { loadHomeGlobalStats } from '../loaders/home-global-stats';

const describePostgres = process.env.D31_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('loadHomeGlobalStats with PostgreSQL fixtures', () => {
  let client: any;

  beforeAll(async () => {
    require('dotenv').config();
    if (process.env.STAGE !== 'dev') {
      throw new Error('D31 PostgreSQL tests require STAGE=dev');
    }

    const { Client } = require('pg');
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    await client.query(`
      CREATE TEMP TABLE disc (
        id integer PRIMARY KEY,
        "releaseDate" date,
        "genreId" text,
        "artistId" integer
      );
      CREATE TEMP TABLE artist (id integer PRIMARY KEY, "countryId" integer);
      CREATE TEMP TABLE country (id integer PRIMARY KEY, name text);
      CREATE TEMP TABLE rate ("discId" integer, rate numeric);
    `);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await client.query('TRUNCATE rate, disc, artist, country');
    await client.query(`
      INSERT INTO country (id, name) VALUES (1, 'Fixtureland'), (2, 'Otherland');
      INSERT INTO artist (id, "countryId") VALUES (1, 1), (2, 2);
      INSERT INTO disc (id, "releaseDate", "genreId", "artistId") VALUES
        (1, DATE '2020-01-01', 'g', 1),
        (2, DATE '2022-06-30', 'g', 1),
        (3, DATE '2023-01-01', 'g', 1),
        (4, DATE '2024-12-31', 'g', 1),
        (5, DATE '2019-12-31', 'g', 1),
        (6, DATE '2025-01-01', 'g', 1),
        (7, DATE '2023-01-01', 'other', 1),
        (8, DATE '2023-01-01', 'g', 2);
      INSERT INTO rate ("discId", rate) VALUES
        (1, 4.00), (1, NULL),
        (2, 2.00), (2, 4.00),
        (3, NULL),
        (4, 5.00), (5, 5.00), (6, 5.00), (7, 5.00), (8, 5.00);
    `);
  });

  async function loadStats(
    dateRange: string[] = ['2020-01-01', '2025-12-31'],
    today = '2024-12-31',
  ) {
    const filters = buildHomeDiscFilters({
      userId: 'unused-for-global-query',
      dateRange,
      genreId: 'g',
      country: 'Fixtureland',
      today: new Date(`${today}T00:00:00.000Z`),
    });
    let rawRow: any;
    const repository = {
      query: async (sql: string, params: unknown[]) => {
        const result = await client.query(sql, params as any[]);
        rawRow = result.rows[0];
        return result.rows;
      },
    };

    const stats = await loadHomeGlobalStats(
      repository as any,
      filters.globalWhere,
      filters.globalParams,
    );
    return { stats, rawRow };
  }

  it('aggregates multiple discs, ignores NULL rates as votes, includes unrated discs, and honors filters and inclusive date bounds', async () => {
    const { stats, rawRow } = await loadStats();

    // The four matching per-disc averages are 4, 3, 0 (NULL-only), and 5.
    expect(stats).toEqual({ globalAvgRate: 3, medianVotes: 1 });
    expect(rawRow.globalAvgRate).toBe('3.0000000000000000');
    expect(rawRow.medianVotes).toBe(1);
    expect(typeof rawRow.globalAvgRate).toBe('string');
    expect(typeof rawRow.medianVotes).toBe('number');
  });

  it('includes a disc on the dateRange upper boundary when today is later', async () => {
    const { stats } = await loadStats(
      ['2020-01-01', '2024-12-31'],
      '2025-12-31',
    );

    expect(stats).toEqual({ globalAvgRate: 3, medianVotes: 1 });
  });

  it('returns NULL aggregates for no matching discs and preserves the TypeScript defaults', async () => {
    const { stats, rawRow } = await loadStats(['2030-01-01', '2030-12-31']);

    expect(rawRow).toEqual({ globalAvgRate: null, medianVotes: null });
    expect(stats).toEqual({ globalAvgRate: 0, medianVotes: 1 });
  });

  it('preserves continuous median output followed by the current integer conversion and fallback', async () => {
    await client.query('TRUNCATE rate, disc');
    await client.query(`
      INSERT INTO disc (id, "releaseDate", "genreId", "artistId") VALUES
        (1, DATE '2023-01-01', 'g', 1),
        (2, DATE '2023-01-01', 'g', 1);
      INSERT INTO rate ("discId", rate) VALUES (2, 4.00);
    `);

    const { stats, rawRow } = await loadStats();

    expect(rawRow.medianVotes).toBe(0.5);
    expect(stats).toEqual({ globalAvgRate: 2, medianVotes: 1 });
  });
});
