import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesEventSetCohortService } from '../rates-event-set-cohort.service';

const enabled = process.env.RATE_STATS_EVENT_COHORT_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('est_be5_event_cohort_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Rates event cohort PostgreSQL integration requires a loopback-only empty database named with the est_be5_event_cohort_ prefix.',
    );
  }
}

integrationSuite('Rates event set cohort PostgreSQL integration', () => {
  let dataSource: DataSource;
  let ownsFixtureTables = false;
  let userId: string;
  let otherUserId: string;
  const eventIds = new Map<string, string>();

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
        'Rates event cohort PostgreSQL integration database must be empty.',
      );
    }

    ownsFixtureTables = true;
    await dataSource.query(
      'CREATE TABLE "disc" ("id" uuid PRIMARY KEY, "releaseDate" date)',
    );
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

    const discs = new Map<string, string | null>([
      ['eligible', '2027-04-01'],
      ['other-release-year', '2026-12-31'],
      ['future-release-year', '2028-01-01'],
      ['null-release-date', null],
    ]);
    const discIds = new Map<string, string>();
    for (const [key, releaseDate] of discs) {
      const id = randomUUID();
      discIds.set(key, id);
      await dataSource.query(
        'INSERT INTO "disc" ("id", "releaseDate") VALUES ($1, $2::date)',
        [id, releaseDate],
      );
    }

    const events = [
      [
        'included-start',
        userId,
        '2027-01-01T08:00:00Z',
        'set',
        'eligible',
        null,
        7,
      ],
      [
        'included-second-same-disc',
        userId,
        '2027-06-01T12:00:00Z',
        'set',
        'eligible',
        null,
        8,
      ],
      [
        'included-last-before-end',
        userId,
        '2028-01-01T07:59:59.999999Z',
        'set',
        'eligible',
        null,
        9,
      ],
      [
        'excluded-before-start',
        userId,
        '2027-01-01T07:59:59.999999Z',
        'set',
        'eligible',
        null,
        6,
      ],
      [
        'excluded-end',
        userId,
        '2028-01-01T08:00:00Z',
        'set',
        'eligible',
        null,
        6,
      ],
      [
        'excluded-release-2026',
        userId,
        '2027-02-01T12:00:00Z',
        'set',
        'other-release-year',
        null,
        7,
      ],
      [
        'excluded-release-2028',
        userId,
        '2027-02-01T12:00:00Z',
        'set',
        'future-release-year',
        null,
        7,
      ],
      [
        'excluded-change',
        userId,
        '2027-02-01T12:00:00Z',
        'change',
        'eligible',
        7,
        8,
      ],
      [
        'excluded-other-user',
        otherUserId,
        '2027-02-01T12:00:00Z',
        'set',
        'eligible',
        null,
        7,
      ],
      [
        'excluded-null-disc',
        userId,
        '2027-02-01T12:00:00Z',
        'set',
        null,
        null,
        7,
      ],
      [
        'excluded-deleted-disc',
        userId,
        '2027-02-01T12:00:00Z',
        'set',
        'missing-disc',
        null,
        7,
      ],
      [
        'excluded-null-release',
        userId,
        '2027-02-01T12:00:00Z',
        'set',
        'null-release-date',
        null,
        7,
      ],
      [
        'excluded-invalid-set-transition',
        userId,
        '2027-02-01T12:00:00Z',
        'set',
        'eligible',
        7,
        8,
      ],
    ] as const;

    for (const [
      key,
      owner,
      occurredAt,
      type,
      discKey,
      previous,
      next,
    ] of events) {
      const id = randomUUID();
      eventIds.set(key, id);
      await dataSource.query(
        `INSERT INTO "rate_vote_events"
          ("id", "user_id", "occurred_at", "event_type", "disc_id", "previous_value", "new_value")
         VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7)`,
        [
          id,
          owner,
          occurredAt,
          type,
          discKey ? (discIds.get(discKey) ?? randomUUID()) : null,
          previous,
          next,
        ],
      );
    }
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (ownsFixtureTables) {
      await dataSource.query('DROP TABLE IF EXISTS "rate_vote_events"');
      await dataSource.query('DROP TABLE IF EXISTS "disc"');
    }
    await dataSource.destroy();
  });

  it('applies editorial year, local instant range, event semantics, joins, and user isolation independent of session zone', async () => {
    const fetchWithSessionZone = (sessionTimeZone: string) =>
      dataSource.transaction(async (manager) => {
        await manager.query("SELECT set_config('TimeZone', $1, true)", [
          sessionTimeZone,
        ]);
        const repository = manager.getRepository(RateVoteEvent);
        return new RatesEventSetCohortService(repository).selectForUser({
          userId,
          year: 2027,
          timeZone: 'America/Los_Angeles',
        });
      });

    const utcSession = await fetchWithSessionZone('UTC');
    const tokyoSession = await fetchWithSessionZone('Asia/Tokyo');
    const eligibleIds = [
      eventIds.get('included-start'),
      eventIds.get('included-second-same-disc'),
      eventIds.get('included-last-before-end'),
    ];
    expect(utcSession.events.map((event) => event.eventId)).toEqual(
      eligibleIds,
    );
    expect(tokyoSession.events.map((event) => event.eventId)).toEqual(
      eligibleIds,
    );
    expect(utcSession.events.map((event) => event.eventId)).toEqual(
      tokyoSession.events.map((event) => event.eventId),
    );
  });
});
