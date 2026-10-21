import {
  HomePostgresClient,
  getHomePostgresValues,
} from './home-postgres-types';
import { HomeQueryRunner } from '../loaders/home-query-runner';
import { loadHomeDiscTotals } from '../loaders/home-totals';

const describePostgres =
  process.env.D34_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('loadHomeDiscTotals with PostgreSQL fixtures', () => {
  let client: HomePostgresClient | null = null;
  const getClient = (): HomePostgresClient => {
    if (!client) throw new Error('PostgreSQL client is not initialized');
    return client;
  };

  beforeAll(async () => {
    const dotenv = await import('dotenv');
    dotenv.config();
    if (process.env.STAGE !== 'dev') {
      throw new Error('D34 PostgreSQL tests require STAGE=dev');
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
      CREATE TEMP TABLE disc (id uuid PRIMARY KEY, "releaseDate" date);
      CREATE TEMP TABLE rate (id uuid PRIMARY KEY, "discId" uuid, rate numeric);
    `);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await getClient().query('TRUNCATE rate, disc');
    await getClient().query(`
      INSERT INTO disc (id, "releaseDate") VALUES
        ('00000000-0000-4000-8000-000000000001', DATE '2024-01-01'),
        ('00000000-0000-4000-8000-000000000002', DATE '2024-12-31'),
        ('00000000-0000-4000-8000-000000000003', DATE '2023-12-31'),
        ('00000000-0000-4000-8000-000000000004', NULL),
        ('00000000-0000-4000-8000-000000000005', DATE '2024-06-30');
      INSERT INTO rate (id, "discId", rate) VALUES
        ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 4),
        ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', NULL),
        ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 2),
        ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000002', 1),
        ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000003', 5),
        ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000004', 3);
    `);
  });

  async function loadTotals(statsDateRange?: string[]) {
    let rawRow: Record<string, unknown> = {};
    const repository: HomeQueryRunner = {
      query: async (sql: string, params: unknown[]) => {
        const result = await getClient().query(
          sql,
          getHomePostgresValues(params),
        );
        rawRow = result.rows[0];
        return result.rows;
      },
    };
    const totals = await loadHomeDiscTotals(repository, statsDateRange);
    return { totals, rawRow };
  }

  it('counts all discs and every non-NULL rating when statsDateRange is absent', async () => {
    const { totals, rawRow } = await loadTotals();

    expect(totals).toEqual({ totalDiscs: 5, totalVotes: 5 });
    expect(typeof rawRow.totalDiscs).toBe('string');
    expect(typeof rawRow.totalVotes).toBe('string');
    expect(typeof totals.totalDiscs).toBe('number');
    expect(typeof totals.totalVotes).toBe('number');
  });

  it('uses inclusive statsDateRange endpoints for both totals and excludes outside and NULL-date discs', async () => {
    const { totals, rawRow } = await loadTotals(['2024-01-01', '2024-12-31']);

    expect(totals).toEqual({ totalDiscs: 3, totalVotes: 3 });
    expect(rawRow.totalDiscs).toBe('3');
    expect(rawRow.totalVotes).toBe('3');
  });

  it('returns zero votes for NULL-only rates and zero totals for an empty catalog', async () => {
    await getClient().query('TRUNCATE rate');
    await getClient().query(
      'INSERT INTO rate (id, "discId", rate) VALUES ($1, $2, NULL)',
      [
        '00000000-0000-4000-8000-000000000107',
        '00000000-0000-4000-8000-000000000005',
      ],
    );
    await expect(
      loadTotals(['2024-01-01', '2024-12-31']),
    ).resolves.toMatchObject({
      totals: { totalDiscs: 3, totalVotes: 0 },
    });

    await getClient().query('TRUNCATE rate, disc');
    await expect(loadTotals()).resolves.toEqual({
      totals: { totalDiscs: 0, totalVotes: 0 },
      rawRow: { totalDiscs: '0', totalVotes: '0' },
    });
  });
});
