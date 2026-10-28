import {
  HomePostgresClient,
  getHomePostgresValues,
} from './home-postgres-types';
import { HomeQueryRunner } from '../loaders/home-query-runner';
import { User } from '../../../../identity/auth/entities/user.entity';
import { TopStatsQueryDto } from 'src/catalog/discs/dto/top-stats-query.dto';
import { DiscTopService } from '../disc-top.service';
import { TopDiscOptionsQueryDto } from '../../dto/top-disc-options-query.dto';

const describePostgres =
  process.env.D32_POSTGRES_TEST === '1' ? describe : describe.skip;
const USER_ID = '00000000-0000-4000-8000-000000000001';
const ARTIST_ID = '00000000-0000-4000-8000-000000000002';
const COUNTRY_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_COUNTRY_ID = '00000000-0000-4000-8000-000000000004';
const GENRE_ID = '00000000-0000-4000-8000-000000000005';
const OTHER_GENRE_ID = '00000000-0000-4000-8000-000000000006';
const DISC_IDS = Array.from(
  { length: 10 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
);

function homeUser(): User {
  return Object.assign(new User(), { id: USER_ID });
}

describePostgres('home disc ranking with PostgreSQL fixtures', () => {
  let client: HomePostgresClient | null = null;
  const getClient = (): HomePostgresClient => {
    if (!client) throw new Error('PostgreSQL client is not initialized');
    return client;
  };

  beforeAll(async () => {
    const dotenv = await import('dotenv');
    dotenv.config();
    if (process.env.STAGE !== 'dev') {
      throw new Error('D32 PostgreSQL tests require STAGE=dev');
    }

    const { Client } = await import('pg');
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    await getClient().query(`
      CREATE TEMP TABLE country (id uuid PRIMARY KEY, name text, "isoCode" text);
      CREATE TEMP TABLE artist (id uuid PRIMARY KEY, name text, "countryId" uuid);
      CREATE TEMP TABLE genre (id uuid PRIMARY KEY, name text, color text);
      CREATE TEMP TABLE disc (
        id uuid PRIMARY KEY,
        name text,
        "releaseDate" date,
        pinned boolean,
        "artistId" uuid,
        "genreId" uuid,
        description text,
        image text,
        verified boolean,
        ep boolean,
        debut boolean,
        link text,
        featured boolean
      );
      CREATE TEMP TABLE rate (
        id uuid PRIMARY KEY,
        "discId" uuid,
        "userId" uuid,
        rate numeric,
        cover numeric
      );
      CREATE TEMP TABLE favorite (id uuid PRIMARY KEY, "discId" uuid, "userId" uuid);
      CREATE TEMP TABLE pending (id uuid PRIMARY KEY, "discId" uuid, "userId" uuid);
      CREATE TEMP TABLE comment (id uuid PRIMARY KEY, "discId" uuid);
    `);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  async function clearFixtures() {
    await getClient().query(
      'TRUNCATE comment, pending, favorite, rate, disc, genre, artist, country',
    );
  }

  async function seedBaseFixtures() {
    await clearFixtures();
    await getClient().query(
      `INSERT INTO country (id, name, "isoCode") VALUES
        ($1, 'Fixtureland', 'FX'), ($2, 'Otherland', 'OT')`,
      [COUNTRY_ID, OTHER_COUNTRY_ID],
    );
    await getClient().query(
      `INSERT INTO artist (id, name, "countryId") VALUES
        ($1, 'Fixture Artist', $2), ($3, 'Other Artist', $4)`,
      [
        ARTIST_ID,
        COUNTRY_ID,
        '00000000-0000-4000-8000-000000000007',
        OTHER_COUNTRY_ID,
      ],
    );
    await getClient().query(
      `INSERT INTO genre (id, name, color) VALUES
        ($1, 'Fixture Genre', '#000'), ($2, 'Other Genre', '#fff')`,
      [GENRE_ID, OTHER_GENRE_ID],
    );
    await getClient().query(
      `INSERT INTO disc
        (id, name, "releaseDate", pinned, "artistId", "genreId", description, image, verified, ep, debut, link, featured)
       VALUES
        ($1, 'Rated', DATE '2022-01-01', false, $10, $12, NULL, NULL, false, false, false, NULL, false),
        ($2, 'Pinned no votes', DATE '2020-01-01', true, $10, $12, NULL, NULL, false, false, false, NULL, false),
        ($3, 'No votes', DATE '2023-01-01', false, $10, $12, NULL, NULL, false, false, false, NULL, false),
        ($4, 'NULL only', DATE '2023-01-01', false, $10, $12, NULL, NULL, false, false, false, NULL, false),
        ($5, 'Pinned NULL only', DATE '2024-12-31', true, $10, $12, NULL, NULL, false, false, false, NULL, false),
        ($6, 'Future pinned', DATE '2025-06-01', true, $10, $12, NULL, NULL, false, false, false, NULL, false),
        ($7, 'Other genre', DATE '2023-01-01', true, $10, $13, NULL, NULL, false, false, false, NULL, false),
        ($8, 'Other country', DATE '2023-01-01', true, $11, $12, NULL, NULL, false, false, false, NULL, false),
        ($9, 'Pinned tie', DATE '2024-12-31', true, $10, $12, NULL, NULL, false, false, false, NULL, false)`,
      [
        DISC_IDS[0],
        DISC_IDS[1],
        DISC_IDS[2],
        DISC_IDS[3],
        DISC_IDS[4],
        DISC_IDS[5],
        DISC_IDS[6],
        DISC_IDS[7],
        DISC_IDS[8],
        ARTIST_ID,
        '00000000-0000-4000-8000-000000000007',
        GENRE_ID,
        OTHER_GENRE_ID,
      ],
    );
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate, cover) VALUES
        ('00000000-0000-4000-8000-000000000101', $1, '00000000-0000-4000-8000-000000000111', 4.00, 3.00),
        ('00000000-0000-4000-8000-000000000102', $1, '00000000-0000-4000-8000-000000000112', 2.00, NULL),
        ('00000000-0000-4000-8000-000000000103', $1, '00000000-0000-4000-8000-000000000113', NULL, NULL),
        ('00000000-0000-4000-8000-000000000104', $2, '00000000-0000-4000-8000-000000000114', NULL, NULL),
        ('00000000-0000-4000-8000-000000000105', $3, '00000000-0000-4000-8000-000000000115', NULL, NULL),
        ('00000000-0000-4000-8000-000000000106', $4, '00000000-0000-4000-8000-000000000116', 5.00, NULL),
        ('00000000-0000-4000-8000-000000000107', $5, '00000000-0000-4000-8000-000000000117', 5.00, NULL)`,
      [DISC_IDS[0], DISC_IDS[3], DISC_IDS[4], DISC_IDS[6], DISC_IDS[7]],
    );
    await getClient().query(
      `INSERT INTO favorite (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000201', $1, $2)`,
      [DISC_IDS[0], USER_ID],
    );
    await getClient().query(
      `INSERT INTO pending (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000301', $1, $2)`,
      [DISC_IDS[0], USER_ID],
    );
  }

  async function getOptions(query: TopDiscOptionsQueryDto) {
    const repository: HomeQueryRunner = {
      query: async (sql, params = []) => {
        const result = await getClient().query(
          sql,
          getHomePostgresValues(params),
        );
        return result.rows;
      },
    };
    return new DiscTopService(repository).getTopDiscOptions(query);
  }

  async function runHomeDiscs(
    today: string,
    dateRange: [string, string] = ['2020-01-01', '2025-12-31'],
  ) {
    jest.useFakeTimers().setSystemTime(new Date(`${today}T12:00:00.000Z`));
    const queries: {
      sql: string;
      params: unknown[];
      rows?: Record<string, unknown>[];
    }[] = [];
    const repository: HomeQueryRunner = {
      query: async (sql: string, params: unknown[] = []) => {
        const call: {
          sql: string;
          params: unknown[];
          rows?: Record<string, unknown>[];
        } = {
          sql,
          params,
        };
        queries.push(call);
        if (sql.includes('AVG(avgRates)')) {
          call.rows = (
            await getClient().query(sql, getHomePostgresValues(params))
          ).rows;
          return call.rows;
        }
        if (sql.includes('AS "weightedScore"')) {
          call.rows = (
            await getClient().query(sql, getHomePostgresValues(params))
          ).rows;
          return call.rows;
        }
        return [];
      },
    };
    const service = new DiscTopService(repository);

    try {
      const result = await service.getTopDiscs(
        Object.assign(new TopStatsQueryDto(), {
          dateRange: [new Date(dateRange[0]), new Date(dateRange[1])],
          country: 'Fixtureland',
        }),
        homeUser(),
        GENRE_ID,
      );
      return {
        result,
        queries,
        main: queries.find(({ sql }) => sql.includes('AS "weightedScore"'))!,
      };
    } finally {
      jest.useRealTimers();
    }
  }

  it('keeps rated and pinned membership, ignores NULL votes, aggregates multiple ratings once, filters consistently, and orders by weightedScore', async () => {
    await seedBaseFixtures();
    const { result, main, queries } = await runHomeDiscs('2024-12-31');
    const rows = main.rows!;
    const ids = rows.map(({ id }) => id);
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toContain(DISC_IDS[0]);
    expect(ids).toContain(DISC_IDS[1]);
    expect(ids).toContain(DISC_IDS[4]);
    expect(ids).toContain(DISC_IDS[8]);
    expect(ids).not.toContain(DISC_IDS[2]);
    expect(ids).not.toContain(DISC_IDS[3]);
    expect(ids).not.toContain(DISC_IDS[5]);
    expect(ids).not.toContain(DISC_IDS[6]);
    expect(ids).not.toContain(DISC_IDS[7]);

    expect(Number(byId.get(DISC_IDS[0]).voteCount)).toBe(2);
    expect(Number(byId.get(DISC_IDS[0]).averageRate)).toBe(3);
    expect(Number(byId.get(DISC_IDS[0]).weightedScore)).toBeCloseTo(13 / 6);
    for (const pinnedId of [DISC_IDS[1], DISC_IDS[4], DISC_IDS[8]]) {
      expect(Number(byId.get(pinnedId).voteCount)).toBe(0);
      expect(Number(byId.get(pinnedId).weightedScore)).toBeCloseTo(0.5);
    }
    expect(result.discs.map(({ id }) => id)).toEqual(ids);

    const globalQuery = queries.find(({ sql }) =>
      sql.includes('AVG(avgRates)'),
    )!;
    expect(globalQuery.sql).toContain(
      'WHERE d."releaseDate" BETWEEN $1 AND $2 AND d."releaseDate" <= $3 AND d."genreId" = $4 AND c.name = $5',
    );
    expect(main.sql).toContain(
      'WHERE d."releaseDate" BETWEEN $2 AND $3 AND d."releaseDate" <= $4 AND d."genreId" = $5 AND c.name = $6',
    );
    expect(main.sql).toContain('LEFT JOIN artist a ON d."artistId" = a.id');
    expect(main.sql).toContain('LEFT JOIN country c ON a."countryId" = c.id');
    expect(main.sql).toContain('LEFT JOIN genre g ON d."genreId" = g.id');
    expect(main.sql).toContain('LEFT JOIN rate r ON d.id = r."discId"');
    expect(main.sql).toContain('d."pinned" = true OR EXISTS');
    expect(main.sql).toContain('eligible_rate.rate IS NOT NULL');
    expect(main.sql).not.toContain('HAVING');
    expect(main.sql).toContain(
      'ORDER BY "weightedScore" DESC, d.id ASC\n      LIMIT 20;',
    );
    expect(main.sql).not.toContain('LEFT JOIN favorite');
    expect(main.sql).not.toContain('LEFT JOIN pending');
  });

  it('includes a disc at the inclusive dateRange upper bound when today is later', async () => {
    await seedBaseFixtures();
    const { main } = await runHomeDiscs('2025-12-31', [
      '2020-01-01',
      '2024-12-31',
    ]);

    expect(main.rows!.map(({ id }) => id)).toContain(DISC_IDS[4]);
  });

  it('limits 25 equal-score pinned discs to the first 20 IDs in stable tie order', async () => {
    await clearFixtures();
    await getClient().query(
      `INSERT INTO country (id, name, "isoCode") VALUES ($1, 'Fixtureland', 'FX')`,
      [COUNTRY_ID],
    );
    await getClient().query(
      `INSERT INTO artist (id, name, "countryId") VALUES ($1, 'Fixture Artist', $2)`,
      [ARTIST_ID, COUNTRY_ID],
    );
    await getClient().query(
      `INSERT INTO genre (id, name, color) VALUES ($1, 'Fixture Genre', '#000')`,
      [GENRE_ID],
    );
    await getClient().query(
      `INSERT INTO disc (id, name, "releaseDate", pinned, "artistId", "genreId")
       SELECT ('00000000-0000-4000-8000-' || lpad((n + 100)::text, 12, '0'))::uuid,
              'Pinned ' || n, DATE '2023-01-01', true, $1, $2
       FROM generate_series(1, 25) AS n`,
      [ARTIST_ID, GENRE_ID],
    );

    const { main } = await runHomeDiscs('2024-12-31');
    const ids = main.rows!.map(({ id }) => id);

    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
    expect(main.rows!.every(({ pinned }) => pinned === true)).toBe(true);
    expect(ids).toEqual(
      Array.from(
        { length: 20 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
      ),
    );
    expect(main.sql).toContain(
      'ORDER BY "weightedScore" DESC, d.id ASC\n      LIMIT 20;',
    );
  });

  it('returns one disc and uninflated rating aggregates with multiple favorites and pendings', async () => {
    await seedBaseFixtures();
    await getClient().query(
      `INSERT INTO favorite (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000202', $1, $2),
        ('00000000-0000-4000-8000-000000000203', $1, $2);`,
      [DISC_IDS[0], USER_ID],
    );
    await getClient().query(
      `INSERT INTO pending (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000302', $1, $2),
        ('00000000-0000-4000-8000-000000000303', $1, $2);`,
      [DISC_IDS[0], USER_ID],
    );

    const { main, queries } = await runHomeDiscs('2024-12-31');
    const ratedDiscRows = main.rows!.filter(({ id }) => id === DISC_IDS[0]);

    expect(ratedDiscRows).toHaveLength(1);
    expect(Number(ratedDiscRows[0].voteCount)).toBe(2);
    expect(Number(ratedDiscRows[0].averageRate)).toBe(3);
    expect(Number(ratedDiscRows[0].averageCover)).toBe(3);

    const { globalAvgRate, medianVotes } = queries.find(({ sql }) =>
      sql.includes('AVG(avgRates)'),
    )!.rows![0];
    const effectiveMedianVotes = parseInt(String(medianVotes), 10) || 1;
    const expectedWeightedScore =
      (3 * 2 + Number(globalAvgRate) * effectiveMedianVotes) /
      (2 + effectiveMedianVotes);
    expect(Number(ratedDiscRows[0].weightedScore)).toBeCloseTo(
      expectedWeightedScore,
    );

    const ids = main.rows!.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns cross-filtered options for every eligible disc, including zero-rate and pinned discs', async () => {
    await seedBaseFixtures();
    jest.useFakeTimers().setSystemTime(new Date('2024-12-31T12:00:00.000Z'));

    try {
      const zeroCountryId = '00000000-0000-4000-8000-000000000008';
      const unratedCountryId = '00000000-0000-4000-8000-000000000009';
      const zeroGenreId = '00000000-0000-4000-8000-000000000010';
      const unratedGenreId = '00000000-0000-4000-8000-000000000011';
      const zeroArtistId = '00000000-0000-4000-8000-000000000012';
      const unratedArtistId = '00000000-0000-4000-8000-000000000013';
      await getClient().query(
        `INSERT INTO country (id, name, "isoCode") VALUES
          ($1, 'Zero Country', 'Z0'), ($2, 'Unrated Country', 'U0')`,
        [zeroCountryId, unratedCountryId],
      );
      await getClient().query(
        `INSERT INTO genre (id, name, color) VALUES
          ($1, 'Zero Genre', '#000'), ($2, 'Unrated Genre', '#fff')`,
        [zeroGenreId, unratedGenreId],
      );
      await getClient().query(
        `INSERT INTO artist (id, name, "countryId") VALUES
          ($1, 'Zero Rate Artist', $2), ($3, 'Unrated Artist', $4)`,
        [zeroArtistId, zeroCountryId, unratedArtistId, unratedCountryId],
      );
      await getClient().query(
        `UPDATE disc SET "artistId" = $2, "genreId" = $3 WHERE id = $1`,
        [DISC_IDS[2], zeroArtistId, zeroGenreId],
      );
      await getClient().query(
        `UPDATE disc SET "artistId" = $2, "genreId" = $3 WHERE id = $1`,
        [DISC_IDS[3], unratedArtistId, unratedGenreId],
      );
      await getClient().query(
        `INSERT INTO rate (id, "discId", "userId", rate, cover)
         VALUES ('00000000-0000-4000-8000-000000000108', $1,
           '00000000-0000-4000-8000-000000000118', 0, NULL)`,
        [DISC_IDS[2]],
      );

      const dateRange: [Date, Date] = [
        new Date('2020-01-01'),
        new Date('2025-12-31'),
      ];
      const allOptions = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), { dateRange }),
      );
      expect(allOptions.countries.map(({ id }) => id)).toEqual([
        COUNTRY_ID,
        OTHER_COUNTRY_ID,
        zeroCountryId,
      ]);
      expect(allOptions.genres.map(({ id }) => id)).toEqual([
        GENRE_ID,
        OTHER_GENRE_ID,
        zeroGenreId,
      ]);
      expect(allOptions.countries.map(({ name }) => name)).not.toContain(
        'Unrated Country',
      );
      expect(allOptions.genres.map(({ name }) => name)).not.toContain(
        'Unrated Genre',
      );

      const byCountry = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange,
          countryId: OTHER_COUNTRY_ID,
        }),
      );
      expect(byCountry.countries.map(({ id }) => id)).toEqual([
        COUNTRY_ID,
        OTHER_COUNTRY_ID,
        zeroCountryId,
      ]);
      expect(byCountry.genres.map(({ id }) => id)).toEqual([GENRE_ID]);

      const matchingRanking = await runHomeDiscs('2024-12-31', [
        '2020-01-01',
        '2025-12-31',
      ]);
      const matchingOptions = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange,
          country: 'Fixtureland',
          genreId: GENRE_ID,
        }),
      );
      expect(matchingRanking.main.rows?.length).toBeGreaterThan(0);
      expect(
        matchingRanking.main.rows?.every((row) =>
          matchingOptions.countries.some(
            (option) => option.id === row.countryId,
          ),
        ),
      ).toBe(true);
      expect(
        matchingRanking.main.rows?.every((row) =>
          matchingOptions.genres.some(
            (option) => option.name === row.genreName,
          ),
        ),
      ).toBe(true);

      const byGenre = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange,
          genreId: OTHER_GENRE_ID,
        }),
      );
      expect(byGenre.countries.map(({ id }) => id)).toEqual([COUNTRY_ID]);
      expect(byGenre.genres.map(({ id }) => id)).toEqual([
        GENRE_ID,
        OTHER_GENRE_ID,
        zeroGenreId,
      ]);

      const unknownCountry = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange,
          countryId: '00000000-0000-4000-8000-000000000099',
        }),
      );
      expect(unknownCountry.countries).toHaveLength(3);
      expect(unknownCountry.genres).toEqual([]);

      const unknownGenre = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange,
          genreId: '00000000-0000-4000-8000-000000000098',
        }),
      );
      expect(unknownGenre.countries).toEqual([]);
      expect(unknownGenre.genres).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('caps future dates, keeps inclusive bounds, and returns empty options for future or inverted ranges', async () => {
    await seedBaseFixtures();
    jest.useFakeTimers().setSystemTime(new Date('2024-12-31T12:00:00.000Z'));

    try {
      const boundaryCountryId = '00000000-0000-4000-8000-000000000014';
      const futureCountryId = '00000000-0000-4000-8000-000000000015';
      const boundaryGenreId = '00000000-0000-4000-8000-000000000016';
      const futureGenreId = '00000000-0000-4000-8000-000000000017';
      const boundaryArtistId = '00000000-0000-4000-8000-000000000018';
      const futureArtistId = '00000000-0000-4000-8000-000000000019';
      await getClient().query(
        `INSERT INTO country (id, name, "isoCode") VALUES
          ($1, 'Boundaryland', 'BD'), ($2, 'Futureland', 'FU')`,
        [boundaryCountryId, futureCountryId],
      );
      await getClient().query(
        `INSERT INTO genre (id, name, color) VALUES
          ($1, 'Boundary Genre', '#bbb'), ($2, 'Future Genre', '#fff')`,
        [boundaryGenreId, futureGenreId],
      );
      await getClient().query(
        `INSERT INTO artist (id, name, "countryId") VALUES
          ($1, 'Boundary Artist', $2), ($3, 'Future Artist', $4)`,
        [boundaryArtistId, boundaryCountryId, futureArtistId, futureCountryId],
      );
      await getClient().query(
        `UPDATE disc SET "artistId" = $2, "genreId" = $3 WHERE id = $1`,
        [DISC_IDS[8], boundaryArtistId, boundaryGenreId],
      );
      await getClient().query(
        `UPDATE disc SET "artistId" = $2, "genreId" = $3 WHERE id = $1`,
        [DISC_IDS[5], futureArtistId, futureGenreId],
      );

      const exactBoundary = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange: [new Date('2024-12-31'), new Date('2024-12-31')],
        }),
      );
      expect(exactBoundary.countries.map(({ id }) => id)).toEqual([
        boundaryCountryId,
      ]);
      expect(exactBoundary.genres.map(({ id }) => id)).toEqual([
        boundaryGenreId,
      ]);

      const inclusive = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange: [new Date('2020-01-01'), new Date('2025-12-31')],
        }),
      );
      expect(inclusive.countries.map(({ id }) => id)).toContain(COUNTRY_ID);
      expect(inclusive.countries.map(({ id }) => id)).toContain(
        OTHER_COUNTRY_ID,
      );
      expect(inclusive.countries.map(({ id }) => id)).toContain(
        boundaryCountryId,
      );
      expect(inclusive.countries.map(({ id }) => id)).not.toContain(
        futureCountryId,
      );

      const allPeriod = await getOptions(new TopDiscOptionsQueryDto());
      expect(allPeriod.countries.map(({ id }) => id)).toContain(
        boundaryCountryId,
      );
      expect(allPeriod.countries.map(({ id }) => id)).not.toContain(
        futureCountryId,
      );

      const futureStart = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange: [new Date('2025-01-01'), new Date('2025-12-31')],
        }),
      );
      expect(futureStart).toEqual({ countries: [], genres: [] });

      const inverted = await getOptions(
        Object.assign(new TopDiscOptionsQueryDto(), {
          dateRange: [new Date('2024-12-31'), new Date('2020-01-01')],
        }),
      );
      expect(inverted).toEqual({ countries: [], genres: [] });
    } finally {
      jest.useRealTimers();
    }
  });
});
