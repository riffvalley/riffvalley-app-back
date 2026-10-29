import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesCurrentScoresService } from '../rates-current-scores.service';

const enabled = process.env.RATE_STATS_CURRENT_SCORES_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('est_be8_current_scores_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Current score PostgreSQL integration requires a loopback-only empty database named with the est_be8_current_scores_ prefix.',
    );
  }
}

integrationSuite('Rates current scores PostgreSQL integration', () => {
  let dataSource: DataSource;
  let service: RatesCurrentScoresService;
  let ownsFixtureTables = false;
  let userId: string;
  let otherUserId: string;

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
        'Current score PostgreSQL integration database must be empty.',
      );
    }

    ownsFixtureTables = true;
    await dataSource.query(
      'CREATE TABLE "disc" ("id" uuid PRIMARY KEY, "releaseDate" date)',
    );
    await dataSource.query(`
      CREATE TABLE "rate" (
        "id" uuid PRIMARY KEY,
        "userId" uuid NOT NULL,
        "discId" uuid NOT NULL,
        rate decimal(4,2),
        "createdAt" timestamp without time zone NOT NULL,
        "editedAt" timestamp without time zone
      )
    `);
    await dataSource.query(`
      CREATE TABLE "rate_vote_events" (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        occurred_at timestamptz NOT NULL,
        event_type varchar(16) NOT NULL,
        disc_id uuid,
        previous_value decimal(4,2),
        new_value decimal(4,2)
      )
    `);
    userId = randomUUID();
    otherUserId = randomUUID();
    const rateRepository = new Repository<Rate>(
      Rate,
      new EntityManager(dataSource),
    );
    const eventRepository = new Repository<RateVoteEvent>(
      RateVoteEvent,
      new EntityManager(dataSource),
    );
    service = new RatesCurrentScoresService(rateRepository, eventRepository);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (ownsFixtureTables) {
      await dataSource.query('DROP TABLE IF EXISTS "rate_vote_events"');
      await dataSource.query('DROP TABLE IF EXISTS "rate"');
      await dataSource.query('DROP TABLE IF EXISTS "disc"');
    }
    await dataSource.destroy();
  });

  async function addDisc(releaseDate: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      'INSERT INTO "disc" ("id", "releaseDate") VALUES ($1, $2::date)',
      [id, releaseDate],
    );
    return id;
  }

  async function addRate(values: {
    discId: string;
    rate: string | null;
    createdAt: string;
    editedAt?: string | null;
    id?: string;
    userId?: string;
  }): Promise<string> {
    const id = values.id ?? randomUUID();
    await dataSource.query(
      `INSERT INTO "rate" ("id", "userId", "discId", rate, "createdAt", "editedAt")
       VALUES ($1, $2, $3, $4, $5::timestamp, $6::timestamp)`,
      [
        id,
        values.userId ?? userId,
        values.discId,
        values.rate,
        values.createdAt,
        values.editedAt ?? null,
      ],
    );
    return id;
  }

  async function addEvent(values: {
    discId: string;
    occurredAt: string;
    type?: 'set' | 'change';
    previousValue?: number | null;
    newValue?: number | null;
    userId?: string;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO "rate_vote_events"
        (id, user_id, disc_id, occurred_at, event_type, previous_value, new_value)
       VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7)`,
      [
        randomUUID(),
        values.userId ?? userId,
        values.discId,
        values.occurredAt,
        values.type ?? 'set',
        values.previousValue ?? null,
        values.newValue === undefined ? 7 : values.newValue,
      ],
    );
  }

  it('calculates historical current score aggregates and applies the Rate winner before null/range validation', async () => {
    const zeroDisc = await addDisc('2025-02-01');
    const decimalDisc = await addDisc('2025-03-01');
    const tenDisc = await addDisc('2025-04-01');
    const nullWinnerDisc = await addDisc('2025-05-01');
    const outOfRangeDisc = await addDisc('2025-06-01');
    const idTieDisc = await addDisc('2025-07-01');
    const createdAtTieDisc = await addDisc('2025-08-01');
    await addRate({
      discId: zeroDisc,
      rate: '0.00',
      createdAt: '2025-02-01 10:00:00',
    });
    await addRate({
      discId: decimalDisc,
      rate: '7.50',
      createdAt: '2025-03-01 10:00:00',
    });
    await addRate({
      discId: tenDisc,
      rate: '10.00',
      createdAt: '2025-04-01 10:00:00',
    });
    await addRate({
      discId: nullWinnerDisc,
      rate: '8.00',
      createdAt: '2025-05-01 10:00:00',
      editedAt: '2025-05-02 10:00:00',
    });
    await addRate({
      discId: nullWinnerDisc,
      rate: null,
      createdAt: '2025-05-01 10:01:00',
      editedAt: '2025-05-03 10:00:00',
    });
    await addRate({
      discId: outOfRangeDisc,
      rate: '10.01',
      createdAt: '2025-06-01 10:00:00',
    });
    await addRate({
      discId: idTieDisc,
      rate: '1.00',
      createdAt: '2025-07-01 10:00:00',
      id: '00000000-0000-4000-8000-000000000001',
    });
    await addRate({
      discId: idTieDisc,
      rate: '9.00',
      createdAt: '2025-07-01 10:00:00',
      id: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    });
    await addRate({
      discId: createdAtTieDisc,
      rate: '8.00',
      createdAt: '2025-08-01 10:00:00',
    });
    await addRate({
      discId: createdAtTieDisc,
      rate: null,
      createdAt: '2025-08-02 10:00:00',
    });
    await addRate({
      discId: decimalDisc,
      rate: '9.00',
      createdAt: '2024-12-31 23:00:00',
    });

    const result = await service.aggregateForUser(userId, 2025);

    expect(result.scoredDiscs).toBe(4);
    expect(result.mean).toBe(6.625);
    expect(result.median).toBe(8.25);
    expect(
      result.scoreDistribution.map((bucket) => bucket.scoredDiscCount),
    ).toEqual([1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1]);
  });

  it('collapses repeated modern set events to unique discs and joins only the authenticated user current Rates', async () => {
    const firstDisc = await addDisc('2027-02-01');
    const secondDisc = await addDisc('2027-03-01');
    const removedDisc = await addDisc('2027-04-01');
    const wrongYearDisc = await addDisc('2026-12-31');
    const decimalDisc = await addDisc('2027-06-01');
    const nullReleaseDisc = await addDisc('2027-05-01');
    await addRate({
      discId: firstDisc,
      rate: '2.25',
      createdAt: '2027-02-01 10:00:00',
    });
    await addRate({
      discId: firstDisc,
      rate: '8.75',
      createdAt: '2027-02-01 10:01:00',
      editedAt: '2028-03-01 10:00:00',
    });
    await addRate({
      discId: secondDisc,
      rate: '9.50',
      createdAt: '2027-03-01 10:00:00',
    });
    await addRate({
      discId: decimalDisc,
      rate: '0.50',
      createdAt: '2027-06-01 10:00:00',
    });
    await addRate({
      discId: removedDisc,
      rate: null,
      createdAt: '2027-04-01 10:00:00',
    });
    await addRate({
      discId: wrongYearDisc,
      rate: '10.00',
      createdAt: '2027-01-01 10:00:00',
    });
    await addRate({
      discId: secondDisc,
      rate: '0.00',
      createdAt: '2027-03-01 10:01:00',
      userId: otherUserId,
    });
    await addEvent({ discId: firstDisc, occurredAt: '2027-02-02T12:00:00Z' });
    await addEvent({ discId: firstDisc, occurredAt: '2027-02-03T12:00:00Z' });
    await addEvent({ discId: firstDisc, occurredAt: '2027-02-04T12:00:00Z' });
    await addEvent({ discId: firstDisc, occurredAt: '2027-02-05T12:00:00Z' });
    await addEvent({ discId: firstDisc, occurredAt: '2027-02-06T12:00:00Z' });
    await addEvent({ discId: secondDisc, occurredAt: '2027-03-02T12:00:00Z' });
    await addEvent({ discId: removedDisc, occurredAt: '2027-04-02T12:00:00Z' });
    await addEvent({ discId: decimalDisc, occurredAt: '2027-06-02T12:00:00Z' });
    await addEvent({
      discId: firstDisc,
      occurredAt: '2027-02-07T12:00:00Z',
      type: 'change',
      previousValue: 5,
    });
    await addEvent({
      discId: wrongYearDisc,
      occurredAt: '2027-02-05T12:00:00Z',
    });
    await addEvent({
      discId: firstDisc,
      occurredAt: '2027-02-08T12:00:00Z',
      userId: otherUserId,
    });
    await addEvent({
      discId: firstDisc,
      occurredAt: '2028-01-01T00:00:00Z',
    });
    await dataSource.query(
      'UPDATE "disc" SET "releaseDate" = NULL WHERE "id" = $1',
      [nullReleaseDisc],
    );
    await addRate({
      discId: nullReleaseDisc,
      rate: '10.00',
      createdAt: '2027-05-01 10:00:00',
    });
    await addEvent({
      discId: nullReleaseDisc,
      occurredAt: '2027-05-02T12:00:00Z',
    });

    const result = await service.aggregateForUser(userId, 2027, 'UTC');

    expect(result.scoredDiscs).toBe(3);
    expect(result.mean).toBe(6.25);
    expect(result.median).toBe(8.75);
    expect(
      result.scoreDistribution.map((bucket) => bucket.scoredDiscCount),
    ).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0]);
  });

  it('returns null aggregates for an empty year and for activity whose current Rate is absent', async () => {
    const noActivity = await service.aggregateForUser(userId, 2028, 'UTC');
    const activeDiscWithoutRate = await addDisc('2029-02-01');
    await addEvent({
      discId: activeDiscWithoutRate,
      occurredAt: '2029-02-02T12:00:00Z',
    });
    const noCurrentScore = await service.aggregateForUser(userId, 2029, 'UTC');

    for (const result of [noActivity, noCurrentScore]) {
      expect(result.scoredDiscs).toBe(0);
      expect(result.mean).toBeNull();
      expect(result.median).toBeNull();
      expect(result.scoreDistribution).toHaveLength(11);
      expect(
        result.scoreDistribution.reduce(
          (total, bucket) => total + bucket.scoredDiscCount,
          0,
        ),
      ).toBe(0);
    }
  });
});
