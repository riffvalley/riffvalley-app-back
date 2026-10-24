import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { CreateUserAppDailyActivity1791990000000 } from '../../../migrations/1791990000000-CreateUserAppDailyActivity';

const enabled = process.env.ACTIVITY_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('bc_id_3f_2_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Activity PostgreSQL tests require a loopback-only empty database named with the bc_id_3f_2_ prefix.',
    );
  }
}

integrationSuite('App daily activity PostgreSQL integration', () => {
  let dataSource: DataSource;
  let migration: CreateUserAppDailyActivity1791990000000;
  let userId: string;

  beforeAll(async () => {
    assertIsolatedTarget();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      synchronize: false,
      migrationsRun: false,
    });
    await dataSource.initialize();
    const existingTables = (await dataSource.query(`
      SELECT count(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `)) as Array<{ count: number }>;
    if (existingTables[0]?.count !== 0) {
      throw new Error('Activity PostgreSQL test database must be empty.');
    }

    await dataSource.query('CREATE TABLE "users" ("id" uuid PRIMARY KEY)');
    migration = new CreateUserAppDailyActivity1791990000000();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration.up(queryRunner);
    } finally {
      await queryRunner.release();
    }
    userId = randomUUID();
    await dataSource.query('INSERT INTO "users" ("id") VALUES ($1)', [userId]);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (migration) {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await migration.down(queryRunner);
      } finally {
        await queryRunner.release();
      }
    }
    await dataSource.query('DROP TABLE IF EXISTS "users"');
    await dataSource.destroy();
  });

  it('keeps concurrent same-day inserts idempotent', async () => {
    const insert = () =>
      dataSource.query(
        `INSERT INTO "user_app_daily_activity" ("user_id", "activity_date")
         VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date)
         ON CONFLICT ("user_id", "activity_date") DO NOTHING`,
        [userId],
      );

    await Promise.all(Array.from({ length: 12 }, () => insert()));
    const rows = (await dataSource.query(
      'SELECT "activity_date" FROM "user_app_daily_activity" WHERE "user_id" = $1',
      [userId],
    )) as Array<{ activity_date: string }>;
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['2026-01-01T22:59:59Z', '2025-12-31'],
    ['2026-01-01T23:00:00Z', '2026-01-01'],
    ['2026-03-29T00:30:00Z', '2026-03-29'],
    ['2026-03-29T01:30:00Z', '2026-03-29'],
    ['2026-10-25T00:30:00Z', '2026-10-25'],
    ['2026-10-25T01:30:00Z', '2026-10-25'],
  ])('converts %s to the Madrid date %s', async (timestamp, expectedDate) => {
    const rows = (await dataSource.query(
      `SELECT ($1::timestamptz AT TIME ZONE 'Europe/Madrid')::date::text AS day`,
      [timestamp],
    )) as Array<{ day: string }>;
    expect(rows[0]?.day).toBe(expectedDate);
  });

  it.each([
    ['2026-03-30', '2026-03-29T22:30:00Z', 0],
    ['2026-03-30', '2026-03-28T23:30:00Z', 1],
    ['2026-10-26', '2026-10-25T01:30:00Z', 1],
    ['2026-10-26', '2026-10-24T22:30:00Z', 1],
  ] as const)(
    'calculates Madrid calendar-day inactivity across DST for %s and %s',
    async (asOf, timestamp, expectedDays) => {
      const rows = (await dataSource.query(
        `SELECT $1::date - ($2::timestamptz AT TIME ZONE 'Europe/Madrid')::date AS days`,
        [asOf, timestamp],
      )) as Array<{ days: number }>;
      expect(rows[0]?.days).toBe(expectedDays);
    },
  );
});
