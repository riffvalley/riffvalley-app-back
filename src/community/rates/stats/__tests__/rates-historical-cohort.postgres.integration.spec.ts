import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RatesHistoricalAggregationsService } from '../rates-historical-aggregations.service';
import { RatesHistoricalCohortService } from '../rates-historical-cohort.service';

const enabled = process.env.RATE_STATS_COHORT_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('est_be3_cohort_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Rates historical cohort PostgreSQL integration requires a loopback-only empty database named with the est_be3_cohort_ prefix.',
    );
  }
}

integrationSuite('Rates historical cohort PostgreSQL integration', () => {
  let dataSource: DataSource;
  let cohortService: RatesHistoricalCohortService;
  let aggregationsService: RatesHistoricalAggregationsService;
  let userId: string;
  let otherUserId: string;
  let ownsFixtureTables = false;

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
        'Rates historical cohort PostgreSQL test database must be empty.',
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
        "rate" decimal(4,2),
        "createdAt" timestamp without time zone NOT NULL,
        "editedAt" timestamp without time zone
      )
    `);
    const rateRepository = new Repository<Rate>(
      Rate,
      new EntityManager(dataSource),
    );
    cohortService = new RatesHistoricalCohortService(rateRepository);
    aggregationsService = new RatesHistoricalAggregationsService(
      rateRepository,
    );
    userId = randomUUID();
    otherUserId = randomUUID();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (ownsFixtureTables) {
      await dataSource.query('DROP TABLE IF EXISTS "rate"');
      await dataSource.query('DROP TABLE IF EXISTS "disc"');
      await dataSource.query('DROP TABLE IF EXISTS "artist"');
      await dataSource.query('DROP TABLE IF EXISTS "genre"');
    }
    await dataSource.destroy();
  });

  async function insertRate(values: {
    user: string;
    releaseDate: string;
    createdAtLocal: string;
    rate: number | null;
    editedAtLocal?: string | null;
    discId?: string;
    createDisc?: boolean;
  }): Promise<{ rateId: string; discId: string }> {
    const discId = values.discId ?? randomUUID();
    const rateId = randomUUID();
    if (values.createDisc !== false) {
      await dataSource.query(
        'INSERT INTO "disc" ("id", "releaseDate") VALUES ($1, $2::date)',
        [discId, values.releaseDate],
      );
    }
    await dataSource.query(
      `INSERT INTO "rate" ("id", "userId", "discId", "rate", "createdAt", "editedAt")
       VALUES ($1, $2, $3, $4, $5::timestamp, $6::timestamp)`,
      [
        rateId,
        values.user,
        discId,
        values.rate,
        values.createdAtLocal,
        values.editedAtLocal ?? null,
      ],
    );
    return { rateId, discId };
  }

  it('filters both years by local half-open boundaries, publication year, and authenticated user', async () => {
    const firstDay2025 = await insertRate({
      user: userId,
      releaseDate: '2025-01-01',
      createdAtLocal: '2025-01-01 00:00:00',
      rate: 8.25,
      editedAtLocal: '2027-06-10 12:00:00',
    });
    const before2025 = await insertRate({
      user: userId,
      releaseDate: '2025-05-01',
      createdAtLocal: '2024-12-31 23:59:59.999999',
      rate: 7,
    });
    const wrongReleaseYear = await insertRate({
      user: userId,
      releaseDate: '2024-12-31',
      createdAtLocal: '2025-06-01 12:00:00',
      rate: 7,
    });
    const nullCurrentScore = await insertRate({
      user: userId,
      releaseDate: '2025-06-01',
      createdAtLocal: '2025-06-01 12:00:00',
      rate: null,
    });
    const duplicateDisc = randomUUID();
    const duplicateOlder = await insertRate({
      user: userId,
      releaseDate: '2025-07-01',
      createdAtLocal: '2025-07-01 10:00:00',
      rate: 6.5,
      editedAtLocal: '2025-07-02 10:00:00',
      discId: duplicateDisc,
    });
    const duplicateCurrent = await insertRate({
      user: userId,
      releaseDate: '2025-07-01',
      createdAtLocal: '2025-07-01 10:05:00',
      rate: 9.5,
      editedAtLocal: '2025-07-03 10:00:00',
      discId: duplicateDisc,
      createDisc: false,
    });
    const otherUser = await insertRate({
      user: otherUserId,
      releaseDate: '2025-01-01',
      createdAtLocal: '2025-02-01 10:00:00',
      rate: 10,
    });
    const firstDay2026 = await insertRate({
      user: userId,
      releaseDate: '2026-01-01',
      createdAtLocal: '2026-01-01 00:00:00',
      rate: 8,
    });
    const lastMicrosecond2025 = await insertRate({
      user: userId,
      releaseDate: '2025-12-31',
      createdAtLocal: '2025-12-31 23:59:59.999999',
      rate: null,
    });
    const after2026 = await insertRate({
      user: userId,
      releaseDate: '2026-01-01',
      createdAtLocal: '2027-01-01 00:00:00',
      rate: 8,
    });

    const blackMetalGenreId = randomUUID();
    await dataSource.query(
      'INSERT INTO "genre" ("id", "name") VALUES ($1, $2)',
      [blackMetalGenreId, 'Black Metal'],
    );
    await dataSource.query(
      'UPDATE "disc" SET "genreId" = $2 WHERE "id" IN ($1, $3)',
      [firstDay2025.discId, blackMetalGenreId, duplicateDisc],
    );

    const cohort2025 = await cohortService.selectForUser(userId, 2025);
    const cohort2026 = await cohortService.selectForUser(userId, 2026);

    expect(cohort2025.historicalAssignments.map((row) => row.rateId)).toEqual(
      expect.arrayContaining([
        firstDay2025.rateId,
        nullCurrentScore.rateId,
        duplicateOlder.rateId,
        duplicateCurrent.rateId,
        lastMicrosecond2025.rateId,
      ]),
    );
    expect(
      cohort2025.historicalAssignments.map((row) => row.rateId),
    ).not.toEqual(
      expect.arrayContaining([
        before2025.rateId,
        wrongReleaseYear.rateId,
        otherUser.rateId,
        firstDay2026.rateId,
      ]),
    );
    expect(cohort2025.currentScoredDiscs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rateId: firstDay2025.rateId,
          currentRate: 8.25,
        }),
        expect.objectContaining({
          rateId: duplicateCurrent.rateId,
          discId: duplicateDisc,
          currentRate: 9.5,
        }),
      ]),
    );
    expect(cohort2025.currentScoredDiscs).toHaveLength(2);
    expect(
      cohort2025.currentScoredDiscs.map((row) => row.rateId),
    ).not.toContain(nullCurrentScore.rateId);
    expect(cohort2026.historicalAssignments.map((row) => row.rateId)).toEqual([
      firstDay2026.rateId,
    ]);
    expect(cohort2026.currentScoredDiscs.map((row) => row.rateId)).toEqual([
      firstDay2026.rateId,
    ]);
    expect(
      cohort2026.historicalAssignments.map((row) => row.rateId),
    ).not.toContain(after2026.rateId);

    await dataSource.query("SET TIME ZONE 'Pacific/Honolulu'");
    const activity2025 = await aggregationsService.aggregateActivityForUser(
      userId,
      2025,
    );
    await dataSource.query('SET TIME ZONE DEFAULT');
    expect(activity2025.activityCount).toBe(5);
    expect(activity2025.activityByGenre).toEqual([
      { genre: 'Black Metal', activityCount: 3 },
    ]);
    expect(activity2025.activityWithoutGenre).toBe(2);
    expect(activity2025.activityByMonth).toEqual(
      expect.arrayContaining([
        { month: '2025-01', activityCount: 1 },
        { month: '2025-06', activityCount: 1 },
        { month: '2025-07', activityCount: 2 },
        { month: '2025-12', activityCount: 1 },
      ]),
    );
    expect(
      activity2025.activityByMonth.reduce(
        (total, row) => total + row.activityCount,
        0,
      ),
    ).toBe(activity2025.activityCount);
    expect(activity2025.activityByDay).toEqual([
      expect.objectContaining({ date: '2025-01-01', activityCount: 1 }),
      expect.objectContaining({ date: '2025-06-01', activityCount: 1 }),
      expect.objectContaining({ date: '2025-07-01', activityCount: 2 }),
      expect.objectContaining({ date: '2025-12-31', activityCount: 1 }),
    ]);
    expect(
      activity2025.activityByDay.reduce(
        (total, row) => total + row.activityCount,
        0,
      ),
    ).toBe(activity2025.activityCount);
    expect(activity2025.activityByDay.map((row) => row.date)).not.toContain(
      '2026-01-01',
    );
  });

  it('applies Madrid calendar bounds and groups locally for timestamptz', async () => {
    await dataSource.query('TRUNCATE TABLE "rate", "disc"');
    await dataSource.query(`
      ALTER TABLE "rate"
      ALTER COLUMN "createdAt" TYPE timestamp with time zone
      USING "createdAt" AT TIME ZONE 'Europe/Madrid'
    `);

    const atMadridYearStart = randomUUID();
    const immediatelyBeforeMadridYearStart = randomUUID();
    const discAtStart = randomUUID();
    const discBeforeStart = randomUUID();
    await dataSource.query(
      'INSERT INTO "disc" ("id", "releaseDate") VALUES ($1, $3::date), ($2, $3::date)',
      [discAtStart, discBeforeStart, '2025-01-01'],
    );
    await dataSource.query(
      `INSERT INTO "rate" ("id", "userId", "discId", "rate", "createdAt")
       VALUES
         ($1, $2, $3, 8, '2025-01-01 00:00:00'::timestamp AT TIME ZONE 'Europe/Madrid'),
         ($4, $2, $5, 7, '2024-12-31 23:59:59.999999'::timestamp AT TIME ZONE 'Europe/Madrid')`,
      [
        atMadridYearStart,
        userId,
        discAtStart,
        immediatelyBeforeMadridYearStart,
        discBeforeStart,
      ],
    );

    const cohort = await cohortService.selectForUser(userId, 2025);
    await dataSource.query("SET TIME ZONE 'Pacific/Honolulu'");
    const activity = await aggregationsService.aggregateActivityForUser(
      userId,
      2025,
    );
    await dataSource.query('SET TIME ZONE DEFAULT');

    expect(cohort.historicalAssignments.map((row) => row.rateId)).toEqual([
      atMadridYearStart,
    ]);
    expect(cohort.currentScoredDiscs.map((row) => row.rateId)).toEqual([
      atMadridYearStart,
    ]);
    expect(activity).toEqual({
      year: 2025,
      activityCount: 1,
      activityByMonth: expect.arrayContaining([
        { month: '2025-01', activityCount: 1 },
      ]),
      activityByDay: [
        expect.objectContaining({ date: '2025-01-01', activityCount: 1 }),
      ],
    });
  });
});
