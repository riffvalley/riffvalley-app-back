import { EntitySchema, QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import { RateVoteEvent } from '../../rates/entities/rate-vote-event.entity';
import { ActivityHistoryService } from '../activity-history.service';

const enabled = process.env.ACTIVITY_HISTORY_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('activity_history_test_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Activity history PostgreSQL integration tests require a loopback-only database named with the activity_history_test_ prefix.',
    );
  }
}

const eventSchema = new EntitySchema<RateVoteEvent>({
  name: 'RateVoteEvent',
  target: RateVoteEvent,
  tableName: 'rate_vote_events',
  columns: {
    id: { type: 'uuid', primary: true },
    userId: { name: 'user_id', type: 'uuid' },
    occurredAt: { name: 'occurred_at', type: 'timestamptz' },
    eventType: { name: 'event_type', type: 'varchar', length: 16 },
    discId: { name: 'disc_id', type: 'uuid', nullable: true },
    previousValue: { name: 'previous_value', type: 'decimal', nullable: true },
    newValue: { name: 'new_value', type: 'decimal', nullable: true },
  },
});

integrationSuite('Activity history PostgreSQL integration', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    assertIsolatedTarget();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      entities: [eventSchema],
      synchronize: false,
      migrationsRun: false,
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await queryRunner.query(`
      CREATE TEMP TABLE artist (
        id uuid PRIMARY KEY,
        name varchar NOT NULL,
        search_name_normalized text
      );
      CREATE TEMP TABLE genre (id uuid PRIMARY KEY, name varchar NOT NULL);
      CREATE TEMP TABLE disc (
        id uuid PRIMARY KEY,
        name varchar NOT NULL,
        image text,
        "artistId" uuid,
        "genreId" uuid,
        search_name_normalized text
      );
      CREATE TEMP TABLE rate_vote_events (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        occurred_at timestamptz NOT NULL,
        event_type varchar(16) NOT NULL,
        disc_id uuid,
        previous_value numeric(4,2),
        new_value numeric(4,2)
      );
    `);
    await queryRunner.query(
      `INSERT INTO artist (id, name, search_name_normalized) VALUES
        ('10000000-0000-4000-8000-000000000001', 'Artist', 'artist');
       INSERT INTO genre (id, name) VALUES
        ('20000000-0000-4000-8000-000000000001', 'Rock');
       INSERT INTO disc (id, name, image, "artistId", "genreId", search_name_normalized) VALUES
        ('30000000-0000-4000-8000-000000000001', 'Record', 'cover.jpg',
         '10000000-0000-4000-8000-000000000001',
         '20000000-0000-4000-8000-000000000001', 'record');
       INSERT INTO rate_vote_events (id, user_id, occurred_at, event_type, disc_id, previous_value, new_value) VALUES
        ('f0000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', '2026-10-29T12:00:00Z', 'set', '30000000-0000-4000-8000-000000000001', NULL, 7),
        ('f0000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '2026-10-29T12:00:00Z', 'change', '30000000-0000-4000-8000-000000000001', 7, 8),
        ('f0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '2026-10-29T11:59:59.999999Z', 'change', '30000000-0000-4000-8000-000000000001', 8, 9),
        ('f0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '2026-10-29T12:00:00Z', 'change', '30000000-0000-4000-8000-000000000001', 8, 9);`,
    );
  });

  afterAll(async () => {
    if (queryRunner?.isTransactionActive)
      await queryRunner.rollbackTransaction();
    if (queryRunner?.isReleased === false) await queryRunner.release();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('executes the user-scoped keyset projection with same-timestamp ordering and filters', async () => {
    const repository = queryRunner.manager.getRepository(RateVoteEvent);
    const service = new ActivityHistoryService(repository);
    const firstPage = await service.findUserHistory(
      '40000000-0000-4000-8000-000000000001',
      {
        query: 'Record',
        limit: 1,
      },
    );

    expect(firstPage.items.map((item) => item.id)).toEqual([
      'f0000000-0000-4000-8000-000000000003',
    ]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items[0].disc).toEqual({
      id: '30000000-0000-4000-8000-000000000001',
      title: 'Record',
      artist: {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Artist',
      },
      coverUrl: 'cover.jpg',
      genre: { id: '20000000-0000-4000-8000-000000000001', name: 'Rock' },
    });

    const secondPage = await service.findUserHistory(
      '40000000-0000-4000-8000-000000000001',
      {
        query: 'Record',
        limit: 1,
        continuation: firstPage.nextPosition ?? undefined,
      },
    );
    expect(secondPage.items.map((item) => item.id)).toEqual([
      'f0000000-0000-4000-8000-000000000002',
    ]);
    expect(secondPage.hasMore).toBe(true);

    const thirdPage = await service.findUserHistory(
      '40000000-0000-4000-8000-000000000001',
      {
        query: 'Record',
        limit: 1,
        continuation: secondPage.nextPosition ?? undefined,
      },
    );
    expect(thirdPage.items.map((item) => item.id)).toEqual([
      'f0000000-0000-4000-8000-000000000001',
    ]);
    expect(thirdPage.items[0].occurredAt).toBe('2026-10-29T11:59:59.999999Z');
    expect(thirdPage.hasMore).toBe(false);
  });
});
