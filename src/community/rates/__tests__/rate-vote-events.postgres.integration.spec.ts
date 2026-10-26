import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AddDiscAndValuesToRateVoteEvents1792010000000 } from '../../../migrations/1792010000000-AddDiscAndValuesToRateVoteEvents';
import { CreateRateVoteEvents1792000000000 } from '../../../migrations/1792000000000-CreateRateVoteEvents';

const enabled = process.env.RATE_VOTE_EVENTS_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('bc_id_3f_3_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Rate vote event PostgreSQL tests require a loopback-only empty database named with the bc_id_3f_3_ prefix.',
    );
  }
}

integrationSuite('Rate vote events PostgreSQL integration', () => {
  let dataSource: DataSource;
  let migration: CreateRateVoteEvents1792000000000;
  let discValuesMigration: AddDiscAndValuesToRateVoteEvents1792010000000;
  let userId: string;
  let discId: string;

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
      throw new Error(
        'Rate vote event PostgreSQL test database must be empty.',
      );
    }

    await dataSource.query('CREATE TABLE "users" ("id" uuid PRIMARY KEY)');
    await dataSource.query('CREATE TABLE "disc" ("id" uuid PRIMARY KEY)');
    await dataSource.query('CREATE TABLE "rate" ("id" uuid PRIMARY KEY)');
    migration = new CreateRateVoteEvents1792000000000();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration.up(queryRunner);
    } finally {
      await queryRunner.release();
    }
    discValuesMigration = new AddDiscAndValuesToRateVoteEvents1792010000000();
    const discValuesQueryRunner = dataSource.createQueryRunner();
    await discValuesQueryRunner.connect();
    try {
      await discValuesMigration.up(discValuesQueryRunner);
    } finally {
      await discValuesQueryRunner.release();
    }
    userId = randomUUID();
    discId = randomUUID();
    await dataSource.query('INSERT INTO "users" ("id") VALUES ($1)', [userId]);
    await dataSource.query('INSERT INTO "disc" ("id") VALUES ($1)', [discId]);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (discValuesMigration) {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await discValuesMigration.down(queryRunner);
      } finally {
        await queryRunner.release();
      }
    }
    if (migration) {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await migration.down(queryRunner);
      } finally {
        await queryRunner.release();
      }
    }
    await dataSource.query('DROP TABLE IF EXISTS "rate"');
    await dataSource.query('DROP TABLE IF EXISTS "disc"');
    await dataSource.query('DROP TABLE IF EXISTS "users"');
    await dataSource.destroy();
  });

  it.each([
    ['2026-01-01T22:59:59Z', '2026-01-01'],
    ['2026-01-01T23:00:00Z', '2026-01-02'],
    ['2026-03-29T00:30:00Z', '2026-03-29'],
    ['2026-03-29T01:30:00Z', '2026-03-29'],
    ['2026-10-25T00:30:00Z', '2026-10-25'],
    ['2026-10-25T01:30:00Z', '2026-10-25'],
  ])('groups UTC timestamp %s in Madrid day %s', async (timestamp, day) => {
    const rows = (await dataSource.query(
      `SELECT ($1::timestamptz AT TIME ZONE 'Europe/Madrid')::date::text AS day`,
      [timestamp],
    )) as Array<{ day: string }>;
    expect(rows[0]?.day).toBe(day);
  });

  it('rolls back a persisted vote change if its event insert fails', async () => {
    const rateId = randomUUID();
    await expect(
      dataSource.transaction(async (manager) => {
        await manager.query('INSERT INTO "rate" ("id") VALUES ($1)', [rateId]);
        await manager.query(
          `INSERT INTO "rate_vote_events" ("user_id", "event_type") VALUES ($1, 'invalid')`,
          [userId],
        );
      }),
    ).rejects.toThrow();

    const rows = (await dataSource.query(
      'SELECT "id" FROM "rate" WHERE "id" = $1',
      [rateId],
    )) as Array<{ id: string }>;
    expect(rows).toHaveLength(0);
  });

  it('keeps legacy events readable with nullable Disc and value fields', async () => {
    const rows = (await dataSource.query(
      `INSERT INTO "rate_vote_events" ("user_id", "event_type")
       VALUES ($1, 'set')
       RETURNING "event_type", "occurred_at", "disc_id", "previous_value", "new_value"`,
      [userId],
    )) as Array<{
      event_type: string;
      occurred_at: Date;
      disc_id: string | null;
      previous_value: string | null;
      new_value: string | null;
    }>;
    expect(rows[0]?.event_type).toBe('set');
    expect(rows[0]?.occurred_at).toBeInstanceOf(Date);
    expect(rows[0]?.disc_id).toBeNull();
    expect(rows[0]?.previous_value).toBeNull();
    expect(rows[0]?.new_value).toBeNull();
  });

  it('stores a new Disc and transition values, then preserves the event if the Disc is deleted', async () => {
    const eventRows = (await dataSource.query(
      `INSERT INTO "rate_vote_events" (
         "user_id", "disc_id", "event_type", "previous_value", "new_value"
       ) VALUES ($1, $2, 'set', NULL, 7)
       RETURNING "disc_id", "previous_value", "new_value"`,
      [userId, discId],
    )) as Array<{
      disc_id: string;
      previous_value: string | null;
      new_value: string;
    }>;
    expect(eventRows[0]).toMatchObject({
      disc_id: discId,
      previous_value: null,
      new_value: '7.00',
    });

    await dataSource.query('DELETE FROM "disc" WHERE "id" = $1', [discId]);
    const retainedRows = (await dataSource.query(
      'SELECT "disc_id", "event_type" FROM "rate_vote_events" WHERE "user_id" = $1',
      [userId],
    )) as Array<{ disc_id: string | null; event_type: string }>;
    expect(retainedRows[retainedRows.length - 1]).toEqual({
      disc_id: null,
      event_type: 'set',
    });
  });
});
