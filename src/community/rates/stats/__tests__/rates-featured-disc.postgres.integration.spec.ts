import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RateVoteEvent } from '../../entities/rate-vote-event.entity';
import { RatesControversialDiscsService } from '../rates-controversial-discs.service';
import { RatesFeaturedDiscService } from '../rates-featured-disc.service';

const enabled = process.env.RATE_STATS_FEATURED_DISC_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(host ?? '') ||
    !database?.startsWith('est_be9_featured_disc_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'Featured disc PostgreSQL integration requires an empty loopback database named with the est_be9_featured_disc_ prefix.',
    );
  }
}

integrationSuite(
  'Rates featured and controversial discs PostgreSQL integration',
  () => {
    let dataSource: DataSource;
    let featuredService: RatesFeaturedDiscService;
    let controversialService: RatesControversialDiscsService;
    let ownsFixtureTables = false;
    let userId: string;
    let artistId: string;
    let genreId: string;

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
          'Featured disc PostgreSQL integration database must be empty.',
        );
      }

      ownsFixtureTables = true;
      await dataSource.query(
        'CREATE TABLE artist (id uuid PRIMARY KEY, name text NOT NULL)',
      );
      await dataSource.query(
        'CREATE TABLE genre (id uuid PRIMARY KEY, name text NOT NULL, color text)',
      );
      await dataSource.query(`
      CREATE TABLE disc (
        id uuid PRIMARY KEY, name text NOT NULL, image text,
        "releaseDate" date, "artistId" uuid NOT NULL, "genreId" uuid
      )
    `);
      await dataSource.query(`
      CREATE TABLE rate (
        id uuid PRIMARY KEY, "userId" uuid NOT NULL, "discId" uuid NOT NULL,
        rate decimal(4,2), cover decimal(4,2),
        "createdAt" timestamp without time zone NOT NULL,
        "editedAt" timestamp without time zone
      )
    `);
      await dataSource.query(`
      CREATE TABLE rate_vote_events (
        id uuid PRIMARY KEY, user_id uuid NOT NULL,
        occurred_at timestamptz NOT NULL, event_type varchar(16) NOT NULL,
        disc_id uuid, previous_value decimal(4,2), new_value decimal(4,2)
      )
    `);
      userId = randomUUID();
      artistId = randomUUID();
      genreId = randomUUID();
      await dataSource.query('INSERT INTO artist (id, name) VALUES ($1, $2)', [
        artistId,
        'Integration artist',
      ]);
      await dataSource.query(
        'INSERT INTO genre (id, name, color) VALUES ($1, $2, $3)',
        [genreId, 'Integration genre', '#123456'],
      );
      const rateRepository = new Repository<Rate>(
        Rate,
        new EntityManager(dataSource),
      );
      const eventRepository = new Repository<RateVoteEvent>(
        RateVoteEvent,
        new EntityManager(dataSource),
      );
      featuredService = new RatesFeaturedDiscService(
        rateRepository,
        eventRepository,
      );
      controversialService = new RatesControversialDiscsService(
        rateRepository,
        eventRepository,
      );
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

    async function addDisc(
      releaseDate: string,
      name: string,
      id = randomUUID(),
    ): Promise<string> {
      await dataSource.query(
        `INSERT INTO disc (id, name, image, "releaseDate", "artistId", "genreId")
       VALUES ($1, $2, NULL, $3::date, $4, $5)`,
        [id, name, releaseDate, artistId, genreId],
      );
      return id;
    }

    async function addRate(values: {
      discId: string;
      userId?: string;
      rate: string | null;
      cover?: string | null;
      createdAt?: string;
      editedAt?: string | null;
    }): Promise<void> {
      await dataSource.query(
        `INSERT INTO rate (id, "userId", "discId", rate, cover, "createdAt", "editedAt")
       VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp)`,
        [
          randomUUID(),
          values.userId ?? userId,
          values.discId,
          values.rate,
          values.cover ?? null,
          values.createdAt ?? '2025-05-01 10:00:00',
          values.editedAt ?? null,
        ],
      );
    }

    async function addSetEvent(values: {
      discId: string;
      occurredAt: string;
      type?: 'set' | 'change';
      previousValue?: string | null;
      newValue?: string | null;
    }): Promise<void> {
      await dataSource.query(
        `INSERT INTO rate_vote_events
        (id, user_id, occurred_at, event_type, disc_id, previous_value, new_value)
       VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7)`,
        [
          randomUUID(),
          userId,
          values.occurredAt,
          values.type ?? 'set',
          values.discId,
          values.previousValue ?? null,
          values.newValue ?? '7.00',
        ],
      );
    }

    it('selects one historical featured disc and computes controversy from deduplicated current community Rates', async () => {
      const featuredNewer = await addDisc(
        '2025-01-01',
        'Featured newer stable winner',
        '00000000-0000-4000-8000-000000000001',
      );
      const featuredSameDateHigherId = await addDisc(
        '2025-01-01',
        'Featured same date higher ID',
        '00000000-0000-4000-8000-000000000002',
      );
      const featuredOlderLowerId = await addDisc(
        '2025-01-01',
        'Featured older lower ID',
        '00000000-0000-4000-8000-000000000000',
      );
      const controversy = await addDisc('2025-02-01', 'Controversial');
      const tooFewOtherVoters = await addDisc(
        '2025-03-01',
        'Too few other voters',
      );
      await addRate({
        discId: featuredNewer,
        rate: '10.00',
        createdAt: '2025-01-05 10:00:00',
      });
      await addRate({
        discId: featuredSameDateHigherId,
        rate: '10.00',
        createdAt: '2025-01-05 10:00:00',
      });
      await addRate({
        discId: featuredOlderLowerId,
        rate: '10.00',
        createdAt: '2025-01-04 10:00:00',
      });
      await addRate({
        discId: controversy,
        rate: '9.00',
        createdAt: '2025-02-01 10:00:00',
      });
      await addRate({
        discId: tooFewOtherVoters,
        rate: '10.00',
        createdAt: '2025-03-01 10:00:00',
      });

      const voters = Array.from({ length: 4 }, () => randomUUID());
      for (const voterId of voters) {
        await addRate({
          discId: controversy,
          userId: voterId,
          rate: '0.00',
        });
      }
      await addRate({
        discId: controversy,
        userId: voters[0],
        rate: '8.00',
        editedAt: '2025-02-02 10:00:00',
      });
      for (const voterId of voters.slice(0, 3)) {
        await addRate({
          discId: tooFewOtherVoters,
          userId: voterId,
          rate: '1.00',
        });
      }
      await addRate({
        discId: tooFewOtherVoters,
        userId: voters[3],
        rate: '7.00',
        editedAt: '2025-03-02 10:00:00',
      });
      await addRate({
        discId: tooFewOtherVoters,
        userId: voters[3],
        rate: null,
        editedAt: '2025-03-03 10:00:00',
        cover: '9.00',
      });

      await expect(
        featuredService.selectForUser(userId, 2025),
      ).resolves.toMatchObject({
        id: featuredNewer,
        rate: 10,
      });
      const results = await controversialService.analyzeForUser(userId, 2025);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: controversy,
        userRate: 9,
        communityAverage: 3.4,
        diff: 5.6,
        communityRateCount: 5,
      });
    });

    it('uses the latest eligible modern set event once for score tie-breaking', async () => {
      const earlierEventDisc = await addDisc(
        '2027-01-01',
        'Earlier eligible event',
      );
      const laterEventDisc = await addDisc(
        '2027-01-01',
        'Later eligible event',
      );
      await addRate({ discId: earlierEventDisc, rate: '8.00' });
      await addRate({ discId: laterEventDisc, rate: '8.00' });
      await addSetEvent({
        discId: earlierEventDisc,
        occurredAt: '2027-04-01T10:00:00Z',
      });
      await addSetEvent({
        discId: laterEventDisc,
        occurredAt: '2027-04-01T10:00:00Z',
      });
      await addSetEvent({
        discId: laterEventDisc,
        occurredAt: '2027-04-02T10:00:00Z',
      });

      await expect(
        featuredService.selectForUser(userId, 2027, 'UTC'),
      ).resolves.toMatchObject({
        id: laterEventDisc,
        rate: 8,
      });
    });
  },
);
