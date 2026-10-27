import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Rate } from '../../entities/rate.entity';
import { RatesArtistSummaryQueryDto } from '../../dto/rates-artist-summary-query.dto';
import { RatesStatsService } from '../rates-stats.service';

const enabled = process.env.RATE_ARTIST_SUMMARY_PG_INTEGRATION === '1';
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
      'Artist summary PostgreSQL tests require a loopback-only empty database named with the bc_id_3f_3_ prefix.',
    );
  }
}

const id = (value: number): string =>
  '20000000-0000-4000-8000-' + String(value).padStart(12, '0');

integrationSuite('Rates artist summary PostgreSQL integration', () => {
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
        'Rates artist summary PostgreSQL test database must be empty.',
      );
    }

    schemaCreated = true;
    await dataSource.query(`CREATE TABLE artist (
      id uuid PRIMARY KEY,
      name varchar(100) NOT NULL,
      image text,
      "countryId" uuid
    )`);
    await dataSource.query(`CREATE TABLE country (
      id uuid PRIMARY KEY,
      name varchar(255) NOT NULL,
      "isoCode" varchar(50)
    )`);
    await dataSource.query(`CREATE TABLE genre (
      id uuid PRIMARY KEY,
      name varchar(50) NOT NULL
    )`);
    await dataSource.query(`CREATE TABLE disc (
      id uuid PRIMARY KEY,
      name varchar(100) NOT NULL,
      image text,
      "releaseDate" date,
      "artistId" uuid NOT NULL,
      "genreId" uuid
    )`);
    await dataSource.query(`CREATE TABLE rate (
      id uuid PRIMARY KEY,
      "userId" uuid NOT NULL,
      "discId" uuid NOT NULL,
      rate numeric(4, 2),
      cover numeric(4, 2),
      "createdAt" timestamp NOT NULL,
      "editedAt" timestamp
    )`);
    service = new RatesStatsService(dataSource.getRepository(Rate), {
      countUsers: async () => 0,
    } as never);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (schemaCreated) {
      await dataSource.query(
        'DROP TABLE IF EXISTS rate, disc, genre, country, artist CASCADE',
      );
    }
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE rate, disc, genre, country, artist CASCADE',
    );
    await dataSource.query(
      'INSERT INTO country (id, name, "isoCode") VALUES ($1, $2, $3)',
      [id(50), 'Spain', 'ES'],
    );
    await dataSource.query(
      'INSERT INTO genre (id, name) VALUES ($1, $2), ($3, $4)',
      [id(60), 'Rock', id(61), 'Alternative'],
    );
    await dataSource.query(
      'INSERT INTO artist (id, name, image, "countryId") VALUES ($1, $2, $3, $4)',
      [id(1), 'Artist', 'artist-image', id(50)],
    );
    await dataSource.query(
      'INSERT INTO disc (id, name, image, "releaseDate", "artistId", "genreId") VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12), ($13, $14, $15, $16, $17, $18), ($19, $20, $21, $22, $23, $24), ($25, $26, $27, $28, $29, $30), ($31, $32, $33, $34, $35, $36)',
      [
        id(11),
        'Disc One',
        'cover-one',
        '2001-02-03',
        id(1),
        id(60),
        id(12),
        'Disc Two',
        null,
        '2002-03-04',
        id(1),
        id(61),
        id(13),
        'Disc Three',
        'cover-three',
        null,
        id(1),
        id(60),
        id(14),
        'Disc Four',
        'cover-four',
        null,
        id(1),
        id(61),
        id(15),
        'Disc Five',
        'cover-five',
        '2005-06-07',
        id(1),
        id(60),
        id(16),
        'Cover Only',
        null,
        null,
        id(1),
        null,
      ],
    );
  });

  it('deduplicates before full-set statistics and SQL pagination, while isolating users', async () => {
    await dataSource.query(
      `INSERT INTO rate (id, "userId", "discId", rate, cover, "createdAt", "editedAt")
       VALUES
       ($1, $2, $3, 9, 7, '2020-01-01', '2020-02-01'),
       ($4, $2, $3, 7, 8, '2020-01-01', '2020-03-01'),
       ($5, $2, $6, 0, NULL, '2020-01-03', NULL),
       ($7, $2, $8, 4, NULL, '2020-01-04', NULL),
       ($9, $2, $10, 0, NULL, '2020-01-04', NULL),
       ($11, $2, $12, 10, NULL, '2020-01-04', NULL),
       ($13, $2, $14, NULL, 9, '2020-01-05', NULL),
       ($15, $2, $8, 10, NULL, '2020-01-04', NULL),
       ($17, $18, $3, 10, NULL, '2020-04-01', NULL)`,
      [
        id(101),
        id(90),
        id(11),
        id(102),
        id(103),
        id(12),
        id(104),
        id(13),
        id(105),
        id(14),
        id(106),
        id(15),
        id(107),
        id(16),
        id(108),
        id(90),
        id(109),
        id(91),
      ],
    );

    const result = await service.getArtistSummary(
      id(90),
      id(1),
      Object.assign(new RatesArtistSummaryQueryDto(), { page: 1, limit: 1 }),
    );

    expect(result.artist).toEqual({
      id: id(1),
      name: 'Artist',
      image: 'artist-image',
      country: { id: id(50), name: 'Spain', isoCode: 'ES' },
      genres: [
        { id: id(61), name: 'Alternative' },
        { id: id(60), name: 'Rock' },
      ],
    });
    expect(result.stats).toEqual({
      ratedDiscCount: 5,
      averageRate: 5.4,
      highestRatedDisc: { id: id(13), name: 'Disc Three', rate: 10 },
      lowestRatedDisc: { id: id(12), name: 'Disc Two', rate: 0 },
      firstAvailableActivityAt: '2020-01-01T00:00:00.000000',
      lastAvailableActivityAt: '2020-03-01T00:00:00.000000',
    });
    expect(result.discs).toEqual({
      data: [
        {
          id: id(11),
          name: 'Disc One',
          image: 'cover-one',
          releaseDate: '2001-02-03',
          rate: 7,
          cover: 8,
          rateId: id(102),
          lastActivityAt: '2020-03-01T00:00:00.000000',
        },
      ],
      total: 5,
      page: 1,
      limit: 1,
      totalPages: 5,
    });
  });

  it('returns an empty personal summary for an existing artist and 404 for a missing one', async () => {
    const empty = await service.getArtistSummary(
      id(90),
      id(1),
      new RatesArtistSummaryQueryDto(),
    );
    expect(empty.stats).toEqual({
      ratedDiscCount: 0,
      averageRate: null,
      highestRatedDisc: null,
      lowestRatedDisc: null,
      firstAvailableActivityAt: null,
      lastAvailableActivityAt: null,
    });
    expect(empty.discs.data).toEqual([]);

    await expect(
      service.getArtistSummary(id(90), id(2), new RatesArtistSummaryQueryDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns null country, image and genres when the catalogue has none', async () => {
    await dataSource.query(
      'UPDATE artist SET image = NULL, "countryId" = NULL WHERE id = $1',
      [id(1)],
    );
    await dataSource.query(
      'UPDATE disc SET "genreId" = NULL WHERE "artistId" = $1',
      [id(1)],
    );

    const result = await service.getArtistSummary(
      id(90),
      id(1),
      new RatesArtistSummaryQueryDto(),
    );

    expect(result.artist.image).toBeNull();
    expect(result.artist.country).toBeNull();
    expect(result.artist.genres).toEqual([]);
  });

  it('orders activity ties by disc ID and returns a second SQL page without changing full statistics', async () => {
    await dataSource.query(
      'INSERT INTO rate (id, "userId", "discId", rate, "createdAt") VALUES ($1, $2, $3, 8, $4), ($5, $2, $6, 6, $4), ($7, $2, $8, 4, $9)',
      [
        id(201),
        id(90),
        id(11),
        '2020-01-01',
        id(202),
        id(12),
        id(203),
        id(13),
        '2020-02-01',
      ],
    );

    const result = await service.getArtistSummary(
      id(90),
      id(1),
      Object.assign(new RatesArtistSummaryQueryDto(), { page: 2, limit: 1 }),
    );

    expect(result.stats.ratedDiscCount).toBe(3);
    expect(result.stats.averageRate).toBe(6);
    expect(result.discs.data[0]?.id).toBe(id(12));
    expect(result.discs.total).toBe(3);
    expect(result.discs.page).toBe(2);
  });
});
