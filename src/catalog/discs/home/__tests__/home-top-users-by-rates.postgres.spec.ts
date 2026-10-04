import { loadHomeTopUsersByRates } from '../loaders/home-top-users-by-rates';

const describePostgres = process.env.D35_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('loadHomeTopUsersByRates with PostgreSQL fixtures', () => {
  let client: any;
  const userId = (id: number) =>
    `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;

  beforeAll(async () => {
    require('dotenv').config();
    if (process.env.STAGE !== 'dev') {
      throw new Error('D35 PostgreSQL tests require STAGE=dev');
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
      CREATE TEMP TABLE "users" (id uuid PRIMARY KEY, username text);
      CREATE TEMP TABLE disc (id integer PRIMARY KEY, "releaseDate" date);
      CREATE TEMP TABLE rate (
        id uuid PRIMARY KEY,
        "discId" integer,
        "userId" uuid,
        rate numeric
      );
    `);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => {
    await client.query('TRUNCATE rate, disc, "users"');
    await client.query(`
      INSERT INTO "users" (id, username) VALUES
        ('${userId(1)}', 'Ada'), ('${userId(2)}', 'Bea'), ('${userId(3)}', 'Cy'),
        ('${userId(4)}', 'Dan'), ('${userId(5)}', 'Eli'), ('${userId(6)}', 'Fox');
      INSERT INTO disc (id, "releaseDate") VALUES
        (1, DATE '2024-01-01'),
        (2, DATE '2024-12-31'),
        (3, DATE '2023-12-31'),
        (4, NULL);
      INSERT INTO rate (id, "discId", "userId", rate) VALUES
        ('00000000-0000-4000-8000-000000000101', 1, '${userId(1)}', 4),
        ('00000000-0000-4000-8000-000000000102', 1, '${userId(1)}', 3),
        ('00000000-0000-4000-8000-000000000103', 1, '${userId(1)}', NULL),
        ('00000000-0000-4000-8000-000000000104', 1, '${userId(2)}', 5),
        ('00000000-0000-4000-8000-000000000105', 2, '${userId(2)}', 2),
        ('00000000-0000-4000-8000-000000000106', 2, '${userId(3)}', 4),
        ('00000000-0000-4000-8000-000000000107', 3, '${userId(4)}', 3),
        ('00000000-0000-4000-8000-000000000108', 3, '${userId(4)}', 1),
        ('00000000-0000-4000-8000-000000000109', 4, '${userId(5)}', 4),
        ('00000000-0000-4000-8000-000000000110', 2, '${userId(6)}', NULL);
    `);
  });

  async function loadTopUsers(statsDateRange?: string[]) {
    let rawRows: any[] = [];
    let sql = '';
    let params: unknown[] = [];
    const repository = {
      query: async (query: string, values: unknown[]) => {
        sql = query;
        params = values;
        const result = await client.query(query, values as any[]);
        rawRows = result.rows;
        return result.rows;
      },
    };
    const result = await loadHomeTopUsersByRates(repository as any, statsDateRange);
    return { result, rawRows, sql, params };
  }

  it('counts each non-NULL rate, groups by user, and leaves tied order unspecified', async () => {
    const { result, rawRows, sql, params } = await loadTopUsers();

    expect(result).toHaveLength(5);
    expect(result.slice(0, 3).map(({ user }) => user.id).sort()).toEqual([
      userId(1), userId(2), userId(4),
    ]);
    expect(result.slice(0, 3).every(({ rateCount }) => rateCount === 2)).toBe(true);
    expect(result.slice(3).map(({ user, rateCount }) => [user.id, rateCount]).sort()).toEqual([
      [userId(3), 1], [userId(5), 1],
    ]);
    expect(result.some(({ user }) => user.id === userId(6))).toBe(false);
    expect(rawRows[0].rateCount).toBe('2');
    expect(typeof rawRows[0].rateCount).toBe('string');
    expect(sql).toContain('WHERE r.rate IS NOT NULL');
    expect(sql).toContain('COUNT(r.id) AS "rateCount"');
    expect(sql).toContain('GROUP BY u.id, u.username');
    expect(sql).toContain('ORDER BY "rateCount" DESC');
    expect(sql).not.toMatch(/ORDER BY "rateCount" DESC\s*,/);
    expect(sql).toContain('LIMIT 20');
    expect(params).toEqual([]);
  });

  it('filters both exact statsDateRange boundaries and excludes out-of-range or NULL-date discs', async () => {
    const { result, rawRows, params } = await loadTopUsers([
      '2024-01-01',
      '2024-12-31',
    ]);

    expect(result.map(({ user, rateCount }) => [user.id, rateCount]).sort()).toEqual([
      [userId(1), 2], [userId(2), 2], [userId(3), 1],
    ]);
    expect(rawRows.map(({ rateCount }) => rateCount)).toEqual(['2', '2', '1']);
    expect(params).toEqual([
      new Date('2024-01-01'),
      new Date('2024-12-31'),
    ]);
  });

  it('returns an empty ranking when no non-NULL rates match', async () => {
    await client.query('TRUNCATE rate');

    await expect(loadTopUsers(['2030-01-01', '2030-12-31'])).resolves.toMatchObject({
      result: [],
      rawRows: [],
    });
  });

  it('returns at most 20 users and does not promise an order for tied counts', async () => {
    await client.query('TRUNCATE rate, disc, "users"');
    await client.query(`
      INSERT INTO "users" (id, username)
      SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'User ' || n
      FROM generate_series(1, 25) AS n;
      INSERT INTO disc (id, "releaseDate") VALUES (1, DATE '2024-06-01');
      INSERT INTO rate (id, "discId", "userId", rate)
      SELECT ('00000000-0000-4000-8000-' || lpad((n + 100)::text, 12, '0'))::uuid,
             1,
             ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
             5
      FROM generate_series(1, 25) AS n;
    `);

    const { result, sql } = await loadTopUsers();

    expect(result).toHaveLength(20);
    expect(result.every(({ rateCount }) => rateCount === 1)).toBe(true);
    expect(new Set(result.map(({ user }) => user.id)).size).toBe(20);
    const allowedUserIds = new Set(Array.from({ length: 25 }, (_, index) => userId(index + 1)));
    expect(result.every(({ user }) => allowedUserIds.has(user.id))).toBe(true);
    expect(sql).toContain('ORDER BY "rateCount" DESC\n    LIMIT 20;');
    expect(sql).not.toMatch(/ORDER BY "rateCount" DESC\s*,/);
  });
});
