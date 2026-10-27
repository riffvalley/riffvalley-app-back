import { DataSource } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RatesStatsService } from '../rates-stats.service';

const enabled = process.env.RATE_TOP_ARTISTS_PG_INTEGRATION === '1';
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
      'Top artists PostgreSQL tests require a loopback-only empty database named with the bc_id_3f_3_ prefix.',
    );
  }
}

const id = (value: number): string =>
  '10000000-0000-4000-8000-' + String(value).padStart(12, '0');

integrationSuite('Rates top artists PostgreSQL integration', () => {
  let dataSource: DataSource;
  let service: RatesStatsService;
  let schemaCreated = false;

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
        'Rates top artists PostgreSQL test database must be empty.',
      );
    }

    await dataSource.query(`CREATE TABLE artist (
        id uuid PRIMARY KEY,
        name varchar(100) NOT NULL,
        image text
      )`);
    await dataSource.query(`CREATE TABLE disc (
        id uuid PRIMARY KEY,
        "artistId" uuid NOT NULL REFERENCES artist(id)
      )`);
    await dataSource.query(`CREATE TABLE rate (
        id uuid PRIMARY KEY,
        "userId" uuid NOT NULL,
        "discId" uuid NOT NULL REFERENCES disc(id),
        rate numeric(4, 2),
        cover numeric(4, 2),
        "createdAt" timestamp NOT NULL,
        "editedAt" timestamp
      )`);
    schemaCreated = true;
    const repository = dataSource.getRepository(Rate);
    service = new RatesStatsService(repository, {
      countUsers: async () => 0,
    } as never);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (schemaCreated) {
      await dataSource.query('DROP TABLE IF EXISTS rate, disc, artist CASCADE');
    }
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE rate, disc, artist CASCADE');
  });

  it('counts distinct musical discs, includes zero, excludes null and cover-only rows, and isolates users', async () => {
    await dataSource.query(
      'INSERT INTO artist (id, name) VALUES ($1, $2), ($3, $4), ($5, $6)',
      [id(1), 'More discs', id(2), 'Higher mean', id(3), 'Average tie'],
    );
    await dataSource.query(
      'INSERT INTO disc (id, "artistId") VALUES ($1, $2), ($3, $2), ($4, $2), ($5, $6), ($7, $6), ($8, $9), ($10, $9)',
      [
        id(11),
        id(1),
        id(12),
        id(13),
        id(14),
        id(2),
        id(15),
        id(16),
        id(3),
        id(17),
      ],
    );
    await dataSource.query(
      `INSERT INTO rate (id, "userId", "discId", rate, cover, "createdAt")
       VALUES
       ($1, $2, $3, 0, NULL, '2026-01-01'),
       ($4, $2, $5, 8, NULL, '2026-01-01'),
       ($6, $2, $7, 8, NULL, '2026-01-01'),
       ($8, $2, $9, 10, NULL, '2026-01-01'),
       ($10, $2, $11, 10, NULL, '2026-01-01'),
       ($12, $2, $13, NULL, 10, '2026-01-01'),
       ($14, $2, $15, NULL, NULL, '2026-01-01'),
       ($16, $17, $18, 10, NULL, '2026-01-01'),
       ($19, $17, $20, 10, NULL, '2026-01-01')`,
      [
        id(101),
        id(90),
        id(11),
        id(102),
        id(12),
        id(103),
        id(13),
        id(108),
        id(16),
        id(109),
        id(17),
        id(104),
        id(14),
        id(105),
        id(15),
        id(106),
        id(91),
        id(14),
        id(107),
        id(15),
      ],
    );

    await expect(service.getTopArtists(id(90))).resolves.toEqual({
      artists: [
        {
          id: id(1),
          name: 'More discs',
          image: null,
          ratingCount: 3,
          averageRate: 5.333333333333333,
        },
        {
          id: id(3),
          name: 'Average tie',
          image: null,
          ratingCount: 2,
          averageRate: 10,
        },
        {
          id: id(2),
          name: 'Higher mean',
          image: null,
          ratingCount: 2,
          averageRate: 8,
        },
      ],
    });
  });

  it('chooses the newest duplicate and breaks equal timestamps by descending Rate ID before averaging', async () => {
    await dataSource.query('INSERT INTO artist (id, name) VALUES ($1, $2)', [
      id(1),
      'Duplicate check',
    ]);
    await dataSource.query(
      'INSERT INTO disc (id, "artistId") VALUES ($1, $2), ($3, $2)',
      [id(11), id(1), id(12)],
    );
    await dataSource.query(
      `INSERT INTO rate (id, "userId", "discId", rate, "createdAt", "editedAt")
       VALUES
       ($1, $2, $3, 2, '2026-01-01', '2026-01-02'),
       ($4, $2, $3, 10, '2026-01-01', '2026-01-03'),
       ($5, $2, $6, 4, '2026-01-01', '2026-01-03'),
       ($7, $2, $6, 8, '2026-01-01', '2026-01-03')`,
      [id(101), id(90), id(11), id(102), id(103), id(12), id(104)],
    );

    await expect(service.getTopArtists(id(90))).resolves.toEqual({
      artists: [
        {
          id: id(1),
          name: 'Duplicate check',
          image: null,
          ratingCount: 2,
          averageRate: 9,
        },
      ],
    });
  });

  it('applies the seven-row limit after grouping and resolves artist-name and ID ties in SQL', async () => {
    const artistValues = Array.from({ length: 8 }, (_, index) => [
      id(index + 1),
      index < 2 ? 'A same name' : 'Z Artist ' + String(index),
    ]).flat();
    await dataSource.query(
      'INSERT INTO artist (id, name) VALUES ' +
        Array.from(
          { length: 8 },
          (_, index) => '($' + (index * 2 + 1) + ', $' + (index * 2 + 2) + ')',
        ).join(', '),
      artistValues,
    );
    await dataSource.query(
      'INSERT INTO disc (id, "artistId") VALUES ' +
        Array.from(
          { length: 8 },
          (_, index) => '($' + (index * 2 + 1) + ', $' + (index * 2 + 2) + ')',
        ).join(', '),
      Array.from({ length: 8 }, (_, index) => [
        id(index + 20),
        id(index + 1),
      ]).flat(),
    );
    await dataSource.query(
      `INSERT INTO rate (id, "userId", "discId", rate, "createdAt") VALUES ` +
        Array.from(
          { length: 8 },
          (_, index) =>
            '($' +
            (index * 3 + 1) +
            ', $' +
            (index * 3 + 2) +
            ', $' +
            (index * 3 + 3) +
            ", 8, '2026-01-01')",
        ).join(', '),
      Array.from({ length: 8 }, (_, index) => [
        id(index + 101),
        id(90),
        id(index + 20),
      ]).flat(),
    );

    const artists = await service.getTopArtists(id(90));
    expect(artists.artists).toHaveLength(7);
    expect(artists.artists.slice(0, 2).map((artist) => artist.id)).toEqual([
      id(1),
      id(2),
    ]);
    expect(artists.artists.every((artist) => artist.ratingCount === 1)).toBe(
      true,
    );
  });
});
