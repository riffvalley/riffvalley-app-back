import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesCurrentScoresService } from '../rates-current-scores.service';
import { RatesGalaxyDiscsService } from '../rates-galaxy-discs.service';

const enabled = process.env.RATE_STATS_GALAXY_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('est_be10_galaxy_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Galaxy PostgreSQL integration requires a loopback-only empty database named with the est_be10_galaxy_ prefix.',
    );
  }
}

integrationSuite('Rates galaxy PostgreSQL integration', () => {
  let dataSource: DataSource;
  let galaxyService: RatesGalaxyDiscsService;
  let currentScoresService: RatesCurrentScoresService;
  let ownsFixtureTables = false;
  const userId = randomUUID();
  const otherUserId = randomUUID();

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
      throw new Error('Galaxy PostgreSQL integration database must be empty.');
    }

    ownsFixtureTables = true;
    await dataSource.query(
      'CREATE TABLE artist (id uuid PRIMARY KEY, name text)',
    );
    await dataSource.query(
      'CREATE TABLE genre (id uuid PRIMARY KEY, name text, color varchar)',
    );
    await dataSource.query(`
      CREATE TABLE disc (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL,
        "releaseDate" date, "artistId" uuid, "genreId" uuid
      )
    `);
    await dataSource.query(`
      CREATE TABLE rate (
        id uuid PRIMARY KEY, "userId" uuid NOT NULL, "discId" uuid NOT NULL,
        rate decimal(4,2), "createdAt" timestamp without time zone NOT NULL,
        "editedAt" timestamp without time zone
      )
    `);
    await dataSource.query(`
      CREATE TABLE rate_vote_events (
        id uuid PRIMARY KEY, user_id uuid NOT NULL, occurred_at timestamptz NOT NULL,
        event_type varchar(16) NOT NULL, disc_id uuid,
        previous_value decimal(4,2), new_value decimal(4,2)
      )
    `);
    const rateRepository = new Repository<Rate>(
      Rate,
      new EntityManager(dataSource),
    );
    const eventRepository = new Repository<RateVoteEvent>(
      RateVoteEvent,
      new EntityManager(dataSource),
    );
    galaxyService = new RatesGalaxyDiscsService(
      rateRepository,
      eventRepository,
    );
    currentScoresService = new RatesCurrentScoresService(
      rateRepository,
      eventRepository,
    );
    await seedFixture();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (ownsFixtureTables) {
      await dataSource.query('DROP TABLE IF EXISTS rate_vote_events');
      await dataSource.query('DROP TABLE IF EXISTS rate');
      await dataSource.query('DROP TABLE IF EXISTS disc');
      await dataSource.query('DROP TABLE IF EXISTS genre');
      await dataSource.query('DROP TABLE IF EXISTS artist');
    }
    await dataSource.destroy();
  });

  async function addDisc(input: {
    name: string;
    releaseDate: string;
    artistId?: string | null;
    genreId?: string | null;
    id?: string;
  }): Promise<string> {
    const id = input.id ?? randomUUID();
    await dataSource.query(
      `INSERT INTO disc (id, name, "releaseDate", "artistId", "genreId")
       VALUES ($1, $2, $3::date, $4, $5)`,
      [
        id,
        input.name,
        input.releaseDate,
        input.artistId ?? null,
        input.genreId ?? null,
      ],
    );
    return id;
  }

  async function addRate(input: {
    discId: string;
    score: string | null;
    createdAt: string;
    editedAt?: string | null;
    userId?: string;
    id?: string;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO rate (id, "userId", "discId", rate, "createdAt", "editedAt")
       VALUES ($1, $2, $3, $4::decimal(4,2), $5::timestamp, $6::timestamp)`,
      [
        input.id ?? randomUUID(),
        input.userId ?? userId,
        input.discId,
        input.score,
        input.createdAt,
        input.editedAt ?? null,
      ],
    );
  }

  async function addEvent(input: {
    discId: string;
    occurredAt: string;
    type?: 'set' | 'change';
    previousValue?: string | null;
    newValue?: string | null;
    userId?: string;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO rate_vote_events
        (id, user_id, disc_id, occurred_at, event_type, previous_value, new_value)
       VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7)`,
      [
        randomUUID(),
        input.userId ?? userId,
        input.discId,
        input.occurredAt,
        input.type ?? 'set',
        input.previousValue ?? null,
        input.newValue ?? '8.00',
      ],
    );
  }

  async function seedFixture(): Promise<void> {
    const artist = randomUUID();
    const genre = randomUUID();
    await dataSource.query('INSERT INTO artist (id, name) VALUES ($1, $2)', [
      artist,
      'Example artist',
    ]);
    await dataSource.query(
      'INSERT INTO genre (id, name, color) VALUES ($1, $2, $3)',
      [genre, 'Example genre', '#123456'],
    );

    const homonymZ = await addDisc({
      name: 'Homonym',
      releaseDate: '2025-04-02',
      id: 'f0000000-0000-4000-8000-000000000002',
      artistId: artist,
      genreId: genre,
    });
    const homonymA = await addDisc({
      name: 'Homonym',
      releaseDate: '2025-04-02',
      id: 'f0000000-0000-4000-8000-000000000001',
    });
    const wrongReleaseYear = await addDisc({
      name: 'Wrong release year',
      releaseDate: '2024-12-31',
    });
    const wrongAssignmentYear = await addDisc({
      name: 'Wrong assignment year',
      releaseDate: '2025-05-01',
    });
    const nullWinner = await addDisc({
      name: 'Null winner',
      releaseDate: '2025-06-01',
    });
    const invalidWinner = await addDisc({
      name: 'Invalid winner',
      releaseDate: '2025-07-01',
    });
    const eligible2026 = await addDisc({
      name: '2026 record',
      releaseDate: '2026-01-01',
    });
    const repeatedSet = await addDisc({
      name: '2027 record',
      releaseDate: '2027-01-01',
    });
    const otherUserDisc = await addDisc({
      name: 'Other user record',
      releaseDate: '2025-08-01',
    });

    await addRate({
      discId: homonymZ,
      score: '9.00',
      createdAt: '2025-04-03 12:00:00',
    });
    await addRate({
      discId: homonymA,
      score: '9.00',
      createdAt: '2025-04-03 12:00:00',
    });
    await addRate({
      discId: wrongReleaseYear,
      score: '10.00',
      createdAt: '2025-04-03 12:00:00',
    });
    await addRate({
      discId: wrongAssignmentYear,
      score: '10.00',
      createdAt: '2024-12-31 12:00:00',
    });
    await addRate({
      discId: nullWinner,
      score: '7.00',
      createdAt: '2025-06-02 12:00:00',
    });
    await addRate({
      discId: nullWinner,
      score: null,
      createdAt: '2025-06-03 12:00:00',
      editedAt: '2025-06-04 12:00:00',
    });
    await addRate({
      discId: invalidWinner,
      score: '6.00',
      createdAt: '2025-07-02 12:00:00',
    });
    await addRate({
      discId: invalidWinner,
      score: '11.00',
      createdAt: '2025-07-03 12:00:00',
      editedAt: '2025-07-04 12:00:00',
    });
    await addRate({
      discId: eligible2026,
      score: '8.00',
      createdAt: '2026-01-02 12:00:00',
    });
    await addRate({
      discId: repeatedSet,
      score: '8.50',
      createdAt: '2026-12-31 12:00:00',
    });
    await addRate({
      discId: otherUserDisc,
      score: '10.00',
      createdAt: '2025-08-02 12:00:00',
      userId: otherUserId,
    });
    await addEvent({
      discId: repeatedSet,
      occurredAt: '2027-01-02T12:00:00.000Z',
    });
    await addEvent({
      discId: repeatedSet,
      occurredAt: '2027-02-02T12:00:00.000Z',
    });
    await addEvent({
      discId: repeatedSet,
      occurredAt: '2027-03-02T12:00:00.000Z',
      type: 'change',
      previousValue: '8.00',
      newValue: '9.00',
    });
    await addEvent({
      discId: otherUserDisc,
      occurredAt: '2027-01-02T12:00:00.000Z',
      userId: otherUserId,
    });
  }

  it('applies the same population as scoredDiscs and preserves optional metadata, homonyms, and deterministic order', async () => {
    const discs = await galaxyService.selectForUser(
      userId,
      2025,
      'Europe/Madrid',
    );
    const scores = await currentScoresService.aggregateForUser(
      userId,
      2025,
      'Europe/Madrid',
    );

    expect(discs).toHaveLength(2);
    expect(discs.map(({ id }) => id)).toEqual([
      'f0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000002',
    ]);
    expect(discs[0]).toMatchObject({
      name: 'Homonym',
      rate: 9,
      artist: null,
      genre: null,
    });
    expect(discs[1]).toMatchObject({
      artist: { name: 'Example artist' },
      genre: { name: 'Example genre', color: '#123456' },
    });
    expect(scores.scoredDiscs).toBe(discs.length);
  });

  it('selects eligible 2026 and 2027 discs once, ignoring repeated set and change events', async () => {
    const discs2026 = await galaxyService.selectForUser(userId, 2026, 'UTC');
    const scores2026 = await currentScoresService.aggregateForUser(
      userId,
      2026,
      'UTC',
    );
    expect(discs2026.map(({ name }) => name)).toEqual(['2026 record']);
    expect(discs2026).toHaveLength(scores2026.scoredDiscs);

    const discs2027 = await galaxyService.selectForUser(userId, 2027, 'UTC');
    const scores2027 = await currentScoresService.aggregateForUser(
      userId,
      2027,
      'UTC',
    );
    expect(discs2027.map(({ name }) => name)).toEqual(['2027 record']);
    expect(discs2027).toHaveLength(scores2027.scoredDiscs);
  });
});
