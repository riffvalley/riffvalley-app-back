import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesEventSetAggregationsService } from '../rates-event-set-aggregations.service';

const enabled =
  process.env.RATE_STATS_EVENT_AGGREGATIONS_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('est_be6_event_aggregations_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Rates event aggregation PostgreSQL integration requires a loopback-only empty database named with the est_be6_event_aggregations_ prefix.',
    );
  }
}

integrationSuite('Rates event set aggregations PostgreSQL integration', () => {
  let dataSource: DataSource;
  let service: RatesEventSetAggregationsService;
  let ownsFixtureTables = false;
  let userId: string;
  let otherUserId: string;
  let eligibleDiscId: string;
  let wrongYearDiscId: string;

  beforeAll(async () => {
    assertIsolatedTarget();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
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
        'Rates event aggregation PostgreSQL integration database must be empty.',
      );
    }

    ownsFixtureTables = true;
    await dataSource.query(
      'CREATE TABLE "genre" ("id" uuid PRIMARY KEY, "name" text NOT NULL)',
    );
    await dataSource.query(
      'CREATE TABLE "artist" ("id" uuid PRIMARY KEY, "name" text NOT NULL)',
    );
    await dataSource.query(
      'CREATE TABLE "disc" ("id" uuid PRIMARY KEY, "name" text NOT NULL DEFAULT \'Test album\', "releaseDate" date, "genreId" uuid, "artistId" uuid)',
    );
    await dataSource.query(`
      CREATE TABLE "rate" (
        "id" uuid PRIMARY KEY,
        "userId" uuid NOT NULL,
        "discId" uuid NOT NULL,
        rate decimal(4,2),
        "createdAt" timestamptz NOT NULL,
        "editedAt" timestamptz
      )
    `);
    await dataSource.query(`
      CREATE TABLE "rate_vote_events" (
        "id" uuid PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "event_type" varchar(16) NOT NULL,
        "disc_id" uuid,
        "previous_value" decimal(4,2),
        "new_value" decimal(4,2)
      )
    `);
    userId = randomUUID();
    otherUserId = randomUUID();
    eligibleDiscId = randomUUID();
    wrongYearDiscId = randomUUID();
    await dataSource.query(
      'INSERT INTO "disc" ("id", "releaseDate") VALUES ($1, $3::date), ($2, $4::date)',
      [eligibleDiscId, wrongYearDiscId, '2027-05-01', '2026-12-31'],
    );
    const blackMetalGenreId = randomUUID();
    await dataSource.query('INSERT INTO "genre" ("id", "name") VALUES ($1, $2)', [
      blackMetalGenreId,
      'Black Metal',
    ]);
    await dataSource.query(
      'UPDATE "disc" SET "genreId" = $2 WHERE "id" = $1',
      [eligibleDiscId, blackMetalGenreId],
    );
    await dataSource.query(
      'INSERT INTO "rate" ("id", "userId", "discId", rate, "createdAt") VALUES ($1, $2, $3, 8.5, now())',
      [randomUUID(), userId, eligibleDiscId],
    );
    service = new RatesEventSetAggregationsService(
      new Repository<RateVoteEvent>(
        RateVoteEvent,
        new EntityManager(dataSource),
      ),
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (ownsFixtureTables) {
      await dataSource.query('DROP TABLE IF EXISTS "rate_vote_events"');
      await dataSource.query('DROP TABLE IF EXISTS "rate"');
      await dataSource.query('DROP TABLE IF EXISTS "disc"');
      await dataSource.query('DROP TABLE IF EXISTS "artist"');
      await dataSource.query('DROP TABLE IF EXISTS "genre"');
    }
    await dataSource.destroy();
  });

  async function insertEvent(values: {
    userId?: string;
    occurredAt: string;
    discId?: string | null;
    type?: 'set' | 'change';
    previousValue?: number | null;
    newValue?: number | null;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO "rate_vote_events"
        ("id", "user_id", "occurred_at", "event_type", "disc_id", "previous_value", "new_value")
       VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7)`,
      [
        randomUUID(),
        values.userId ?? userId,
        values.occurredAt,
        values.type ?? 'set',
        values.discId === undefined ? eligibleDiscId : values.discId,
        values.previousValue ?? null,
        values.newValue === undefined ? 7 : values.newValue,
      ],
    );
  }

  it('aggregates eligible event identities by local month and day across zones, DST, and session time zones', async () => {
    await insertEvent({ occurredAt: '2027-01-01T00:30:00Z' });
    await insertEvent({ occurredAt: '2027-01-01T00:30:00Z' });
    await insertEvent({ occurredAt: '2027-01-01T08:00:00Z' });
    await insertEvent({ occurredAt: '2027-12-31T23:30:00Z' });
    await insertEvent({ occurredAt: '2027-03-14T09:59:59Z' });
    await insertEvent({ occurredAt: '2027-03-14T10:00:00Z' });
    await insertEvent({ occurredAt: '2027-11-07T08:59:59Z' });
    await insertEvent({ occurredAt: '2027-11-07T09:00:00Z' });
    await insertEvent({ occurredAt: '2027-06-30T18:30:00Z' });
    await insertEvent({
      occurredAt: '2027-02-01T12:00:00Z',
      type: 'change',
      previousValue: 6,
    });
    await insertEvent({
      occurredAt: '2027-02-01T12:00:00Z',
      userId: otherUserId,
    });
    await insertEvent({
      occurredAt: '2027-02-01T12:00:00Z',
      discId: wrongYearDiscId,
    });
    await insertEvent({
      occurredAt: '2027-02-01T12:00:00Z',
      discId: null,
    });
    await insertEvent({
      occurredAt: '2027-02-01T12:00:00Z',
      previousValue: 6,
    });

    const aggregateWithSessionZone = (sessionTimeZone: string) =>
      dataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('TimeZone', $1, true)", [
          sessionTimeZone,
        ]);
        const transactionService = new RatesEventSetAggregationsService(
          manager.getRepository(RateVoteEvent),
        );
        return transactionService.aggregateActivityForUser(userId, 2027, 'UTC');
      });

    const utcSession = await aggregateWithSessionZone('UTC');
    const honoluluSession = await aggregateWithSessionZone('Pacific/Honolulu');
    expect(utcSession).toEqual(honoluluSession);
    expect(utcSession.activityCount).toBe(9);
    expect(utcSession.activityByGenre).toEqual([
      { genre: 'Black Metal', activityCount: 9 },
    ]);
    expect(utcSession.activityWithoutGenre).toBe(0);
    expect(utcSession.activityByMonth).toEqual(
      expect.arrayContaining([
        { month: '2027-01', activityCount: 3 },
        { month: '2027-03', activityCount: 2 },
        { month: '2027-06', activityCount: 1 },
        { month: '2027-11', activityCount: 2 },
        { month: '2027-12', activityCount: 1 },
      ]),
    );
    expect(utcSession.activityByDay).toEqual([
      expect.objectContaining({ date: '2027-01-01', activityCount: 3 }),
      expect.objectContaining({ date: '2027-03-14', activityCount: 2 }),
      expect.objectContaining({ date: '2027-06-30', activityCount: 1 }),
      expect.objectContaining({ date: '2027-11-07', activityCount: 2 }),
      expect.objectContaining({ date: '2027-12-31', activityCount: 1 }),
    ]);
    expect(
      sum(utcSession.activityByMonth.map((row) => row.activityCount)),
    ).toBe(utcSession.activityCount);
    expect(sum(utcSession.activityByDay.map((row) => row.activityCount))).toBe(
      utcSession.activityCount,
    );

    const madrid = await service.aggregateActivityForUser(
      userId,
      2027,
      'Europe/Madrid',
    );
    expect(madrid.activityCount).toBe(8);
    expect(madrid.activityByDay).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2027-01-01', activityCount: 3 }),
        expect.objectContaining({ date: '2027-07-01', activityCount: 1 }),
      ]),
    );

    const losAngeles = await service.aggregateActivityForUser(
      userId,
      2027,
      'America/Los_Angeles',
    );
    expect(losAngeles.activityCount).toBe(7);
    expect(losAngeles.activityByDay).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2027-01-01', activityCount: 1 }),
        expect.objectContaining({ date: '2027-06-30', activityCount: 1 }),
        expect.objectContaining({ date: '2027-12-31', activityCount: 1 }),
      ]),
    );

    const kathmandu = await service.aggregateActivityForUser(
      userId,
      2027,
      'Asia/Kathmandu',
    );
    expect(kathmandu.activityCount).toBe(8);
    expect(kathmandu.activityByDay).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2027-01-01', activityCount: 3 }),
        expect.objectContaining({ date: '2027-07-01', activityCount: 1 }),
        expect.objectContaining({ date: '2027-12-31', activityCount: 1 }),
      ]),
    );
  });

  it('returns a zero year and empty calendar when there are no eligible events', async () => {
    const emptyUserId = randomUUID();
    const result = await service.aggregateActivityForUser(emptyUserId, 2027);

    expect(result.activityCount).toBe(0);
    expect(result.activityByMonth).toHaveLength(12);
    expect(result.activityByMonth.every((row) => row.activityCount === 0)).toBe(
      true,
    );
    expect(result.activityByDay).toEqual([]);
  });

  it('uses exact local year start and exclusive end instants', async () => {
    const boundaryUserId = randomUUID();
    await insertEvent({
      userId: boundaryUserId,
      occurredAt: '2027-01-01T07:59:59.999Z',
    });
    await insertEvent({
      userId: boundaryUserId,
      occurredAt: '2027-01-01T08:00:00Z',
    });
    await insertEvent({
      userId: boundaryUserId,
      occurredAt: '2028-01-01T07:59:59.999Z',
    });
    await insertEvent({
      userId: boundaryUserId,
      occurredAt: '2028-01-01T08:00:00Z',
    });

    const result = await service.aggregateActivityForUser(
      boundaryUserId,
      2027,
      'America/Los_Angeles',
    );

    expect(result.activityCount).toBe(2);
    expect(result.activityByDay).toEqual([
      expect.objectContaining({ date: '2027-01-01', activityCount: 1 }),
      expect.objectContaining({ date: '2027-12-31', activityCount: 1 }),
    ]);
  });
});

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
