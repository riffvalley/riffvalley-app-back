import {
  HomePostgresClient,
  getHomePostgresValues,
  requireTopDiscsPostgresTestTarget,
  verifyTopDiscsPostgresTestIdentity,
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
    requireTopDiscsPostgresTestTarget('D32_POSTGRES_TEST');

    const { Client } = await import('pg');
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    await verifyTopDiscsPostgresTestIdentity(client);
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
        cover numeric,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "editedAt" timestamp
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
    dateRange: [string, string] | undefined = ['2020-01-01', '2025-12-31'],
    filters: { country?: string; genreId?: string } = {
      country: 'Fixtureland',
      genreId: GENRE_ID,
    },
    legacy = false,
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
      const query = Object.assign(new TopStatsQueryDto(), {
        ...(dateRange
          ? { dateRange: [new Date(dateRange[0]), new Date(dateRange[1])] }
          : {}),
        country: filters.country,
      });
      const result = legacy
        ? await service.getLegacyTopDiscs(query, homeUser(), filters.genreId)
        : await service.getTopDiscs(query, homeUser(), filters.genreId);
      return {
        result,
        queries,
        main: queries.find(({ sql }) => sql.includes('AS "weightedScore"'))!,
      };
    } finally {
      jest.useRealTimers();
    }
  }

  it('includes only validly rated discs, ignores NULL votes, uses an unfiltered prior, and orders by weightedScore', async () => {
    await seedBaseFixtures();
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate)
       VALUES ('00000000-0000-4000-8000-000000000115', $1, NULL, 10)`,
      [DISC_IDS[2]],
    );
    const { result, main, queries } = await runHomeDiscs('2024-12-31');
    const rows = main.rows!;
    const ids = rows.map(({ id }) => id);
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(ids).toHaveLength(1);
    expect(new Set(ids).size).toBe(1);
    expect(ids).toContain(DISC_IDS[0]);
    expect(ids).not.toContain(DISC_IDS[1]);
    expect(ids).not.toContain(DISC_IDS[4]);
    expect(ids).not.toContain(DISC_IDS[8]);
    expect(ids).not.toContain(DISC_IDS[2]);
    expect(ids).not.toContain(DISC_IDS[3]);
    expect(ids).not.toContain(DISC_IDS[5]);
    expect(ids).not.toContain(DISC_IDS[6]);
    expect(ids).not.toContain(DISC_IDS[7]);

    expect(Number(byId.get(DISC_IDS[0]).voteCount)).toBe(2);
    expect(Number(byId.get(DISC_IDS[0]).averageRate)).toBe(3);
    expect(Number(byId.get(DISC_IDS[0]).weightedScore)).toBeCloseTo(22 / 6);
    expect(result.discs.map(({ id }) => id)).toEqual(ids);

    expect(
      queries.filter(({ sql }) => sql.includes('AS "weightedScore"')),
    ).toHaveLength(1);
    expect(main.sql).toContain(
      'WHERE d."releaseDate" BETWEEN $2 AND $3 AND d."releaseDate" <= $4 AND d."genreId" = $5 AND c.name = $6',
    );
    expect(main.sql).toContain('LEFT JOIN artist a ON d."artistId" = a.id');
    expect(main.sql).toContain('LEFT JOIN country c ON a."countryId" = c.id');
    expect(main.sql).toContain('LEFT JOIN genre g ON d."genreId" = g.id');
    expect(main.sql).toContain(
      'INNER JOIN disc_rate_stats drs ON drs."discId" = d.id',
    );
    expect(main.sql).toContain('valid_current_rates vr');
    expect(main.sql).toContain('valid_current_rates eligible_rate');
    expect(main.sql).not.toContain('d."pinned"');
    expect(main.sql).toContain('prior_disc."releaseDate" <= $7');
    expect(main.sql).not.toContain('HAVING');
    expect(main.sql).toContain(
      'ORDER BY "weightedScore" DESC, d.id ASC\n      LIMIT 11;',
    );
    expect(main.sql).not.toContain('LEFT JOIN favorite');
    expect(main.sql).not.toContain('LEFT JOIN pending');
  });

  it('includes a disc at the inclusive dateRange upper bound when today is later', async () => {
    await seedBaseFixtures();
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate)
       VALUES ('00000000-0000-4000-8000-000000000113', $1,
         '00000000-0000-4000-8000-000000000123', 5)`,
      [DISC_IDS[4]],
    );
    const { main } = await runHomeDiscs('2025-12-31', [
      '2020-01-01',
      '2024-12-31',
    ]);

    expect(main.rows!.map(({ id }) => id)).toContain(DISC_IDS[4]);
  });

  it('deduplicates by user/disc, counts zero, rejects invalid current values, excludes future releases, and keeps scores filter-stable', async () => {
    await seedBaseFixtures();
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate, "editedAt") VALUES
        ('00000000-0000-4000-8000-000000000108', $1, '00000000-0000-4000-8000-000000000111', 10, TIMESTAMP '2024-01-01'),
        ('00000000-0000-4000-8000-000000000109', $1, '00000000-0000-4000-8000-000000000119', 7, TIMESTAMP '2024-01-01'),
        ('00000000-0000-4000-8000-000000000110', $1, '00000000-0000-4000-8000-000000000119', 11, TIMESTAMP '2024-02-01'),
        ('00000000-0000-4000-8000-000000000111', $1, '00000000-0000-4000-8000-000000000120', 0, NULL),
        ('00000000-0000-4000-8000-000000000112', $2, '00000000-0000-4000-8000-000000000121', 10, NULL),
        ('00000000-0000-4000-8000-000000000116', $1, '00000000-0000-4000-8000-000000000122', 6, TIMESTAMP '2024-01-01'),
        ('00000000-0000-4000-8000-000000000117', $1, '00000000-0000-4000-8000-000000000122', NULL, TIMESTAMP '2024-02-01')`,
      [DISC_IDS[0], DISC_IDS[5]],
    );

    const broadResult = await runHomeDiscs('2024-12-31');
    const narrowResult = await runHomeDiscs('2024-12-31', [
      '2022-01-01',
      '2022-12-31',
    ]);
    const broadDisc = broadResult.main.rows!.find(
      ({ id }) => id === DISC_IDS[0],
    )!;
    const narrowDisc = narrowResult.main.rows!.find(
      ({ id }) => id === DISC_IDS[0],
    )!;

    expect(Number(broadDisc.voteCount)).toBe(3);
    expect(Number(broadDisc.averageRate)).toBe(4);
    expect(Number(broadDisc.weightedScore)).toBeCloseTo(29.6 / 7);
    expect(Number(narrowDisc.weightedScore)).toBeCloseTo(
      Number(broadDisc.weightedScore),
    );
  });

  it('keeps one disc score identical across week, month, year, all, country, and genre filters', async () => {
    await seedBaseFixtures();
    await getClient().query(
      `UPDATE disc SET "releaseDate" = DATE '2022-01-15' WHERE id = $1`,
      [DISC_IDS[0]],
    );
    const contexts = [
      await runHomeDiscs('2024-12-31', ['2022-01-10', '2022-01-16']),
      await runHomeDiscs('2024-12-31', ['2022-01-01', '2022-01-31']),
      await runHomeDiscs('2024-12-31', ['2022-01-01', '2022-12-31']),
      await runHomeDiscs('2024-12-31', undefined, {}),
      await runHomeDiscs('2024-12-31', undefined, { country: 'Fixtureland' }),
      await runHomeDiscs('2024-12-31', undefined, { genreId: GENRE_ID }),
    ];
    const scores = contexts.map(({ main }) => {
      const disc = main.rows!.find(({ id }) => id === DISC_IDS[0]);
      expect(disc).toBeDefined();
      return Number(disc!.weightedScore);
    });

    expect(scores.every((score) => score === scores[0])).toBe(true);
  });

  it('uses createdAt and then descending UUID to resolve current-rate timestamp ties', async () => {
    await seedBaseFixtures();
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate, "createdAt", "editedAt") VALUES
        ('00000000-0000-4000-8000-000000000201', $1, $2, 1, TIMESTAMP '2024-01-01', TIMESTAMP '2024-01-01'),
        ('00000000-0000-4000-8000-000000000202', $1, $2, 2, TIMESTAMP '2024-01-02', TIMESTAMP '2024-01-01'),
        ('00000000-0000-4000-8000-000000000203', $1, $2, 3, TIMESTAMP '2024-01-02', TIMESTAMP '2024-01-02'),
        ('00000000-0000-4000-8000-000000000204', $1, $2, 4, TIMESTAMP '2024-01-02', TIMESTAMP '2024-01-02')`,
      [DISC_IDS[2], USER_ID],
    );

    const { main } = await runHomeDiscs('2024-12-31');
    const selected = main.rows!.find(({ id }) => id === DISC_IDS[2]);

    expect(selected).toBeDefined();
    expect(Number(selected!.voteCount)).toBe(1);
    expect(Number(selected!.averageRate)).toBe(4);
  });

  it('applies k=4 to one, four, and twenty votes and keeps observed means separate', async () => {
    await seedBaseFixtures();
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate) VALUES
        ('00000000-0000-4000-8000-000000000201', $1, '00000000-0000-4000-8000-000000000401', 10)`,
      [DISC_IDS[2]],
    );
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate)
       SELECT
         ('00000000-0000-4000-8000-' || lpad((210 + n)::text, 12, '0'))::uuid,
         $1,
         ('00000000-0000-4000-8000-' || lpad((410 + n)::text, 12, '0'))::uuid,
         8
       FROM generate_series(1, 4) AS series(n)`,
      [DISC_IDS[3]],
    );
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate)
       SELECT
         ('00000000-0000-4000-8000-' || lpad((220 + n)::text, 12, '0'))::uuid,
         $1,
         ('00000000-0000-4000-8000-' || lpad((420 + n)::text, 12, '0'))::uuid,
         6
       FROM generate_series(1, 20) AS series(n)`,
      [DISC_IDS[4]],
    );

    const { main } = await runHomeDiscs('2024-12-31');
    const rows = new Map(main.rows!.map((row) => [String(row.id), row]));
    const prior = 178 / 29;

    expect(Number(rows.get(DISC_IDS[2])!.voteCount)).toBe(1);
    expect(Number(rows.get(DISC_IDS[2])!.averageRate)).toBe(10);
    expect(Number(rows.get(DISC_IDS[2])!.weightedScore)).toBeCloseTo(
      (10 + prior * 4) / 5,
    );
    expect(Number(rows.get(DISC_IDS[3])!.voteCount)).toBe(4);
    expect(Number(rows.get(DISC_IDS[3])!.averageRate)).toBe(8);
    expect(Number(rows.get(DISC_IDS[3])!.weightedScore)).toBeCloseTo(
      (8 * 4 + prior * 4) / 8,
    );
    expect(Number(rows.get(DISC_IDS[4])!.voteCount)).toBe(20);
    expect(Number(rows.get(DISC_IDS[4])!.averageRate)).toBe(6);
    expect(Number(rows.get(DISC_IDS[4])!.weightedScore)).toBeCloseTo(
      (6 * 20 + prior * 4) / 24,
    );
    expect(rows.get(DISC_IDS[4])!.pinned).toBe(true);
  });

  it('returns an empty ranking when no valid published global votes exist', async () => {
    await seedBaseFixtures();
    await getClient().query('DELETE FROM rate');

    const { main } = await runHomeDiscs('2024-12-31');

    expect(main.rows).toEqual([]);
  });

  it('limits 25 equal-score pinned discs to the first 11 IDs in stable tie order', async () => {
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
    await getClient().query(
      `INSERT INTO rate (id, "discId", "userId", rate)
       SELECT
         ('00000000-0000-4000-8000-' || lpad((n + 201)::text, 12, '0'))::uuid,
         d.id,
         ('00000000-0000-4000-8000-' || lpad((n + 301)::text, 12, '0'))::uuid,
         5
       FROM disc d
       CROSS JOIN generate_series(1, 25) AS series(n)
       WHERE d.name = 'Pinned ' || n`,
    );

    const { main } = await runHomeDiscs('2024-12-31');
    const ids = main.rows!.map(({ id }) => id);

    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
    expect(main.rows!.every(({ pinned }) => pinned === true)).toBe(true);
    expect(ids).toEqual(
      Array.from(
        { length: 11 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
      ),
    );
    expect(main.sql).toContain(
      'ORDER BY "weightedScore" DESC, d.id ASC\n      LIMIT 11;',
    );

    const legacy = await runHomeDiscs(
      '2024-12-31',
      ['2020-01-01', '2025-12-31'],
      undefined,
      true,
    );
    const legacyIds = legacy.main.rows!.map(({ id }) => id);
    expect(legacyIds).toHaveLength(11);
    expect(legacyIds).toEqual(
      Array.from(
        { length: 11 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
      ),
    );
    expect(legacy.main.sql).toContain(
      'ORDER BY "weightedScore" DESC, d.id ASC\n      LIMIT 11;',
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

    const { main } = await runHomeDiscs('2024-12-31');
    const ratedDiscRows = main.rows!.filter(({ id }) => id === DISC_IDS[0]);

    expect(ratedDiscRows).toHaveLength(1);
    expect(Number(ratedDiscRows[0].voteCount)).toBe(2);
    expect(Number(ratedDiscRows[0].averageRate)).toBe(3);
    expect(Number(ratedDiscRows[0].averageCover)).toBe(3);

    const expectedWeightedScore = (3 * 2 + 4 * 4) / (2 + 4);
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
      const pinnedOnlyCountryId = '00000000-0000-4000-8000-000000000020';
      const pinnedOnlyGenreId = '00000000-0000-4000-8000-000000000021';
      const pinnedOnlyArtistId = '00000000-0000-4000-8000-000000000022';
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
          ($1, 'Zero Rate Artist', $2),
          ($3, 'Unrated Artist', $4),
          ($5, 'Pinned Only Artist', $6)`,
        [
          zeroArtistId,
          zeroCountryId,
          unratedArtistId,
          unratedCountryId,
          pinnedOnlyArtistId,
          pinnedOnlyCountryId,
        ],
      );
      await getClient().query(
        `INSERT INTO country (id, name, "isoCode") VALUES ($1, 'Pinned Only Country', 'P0')`,
        [pinnedOnlyCountryId],
      );
      await getClient().query(
        `INSERT INTO genre (id, name, color) VALUES ($1, 'Pinned Only Genre', '#f00')`,
        [pinnedOnlyGenreId],
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
        `UPDATE disc SET "artistId" = $2, "genreId" = $3 WHERE id = $1`,
        [DISC_IDS[1], pinnedOnlyArtistId, pinnedOnlyGenreId],
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
      expect(allOptions.countries.map(({ id }) => id)).not.toContain(
        pinnedOnlyCountryId,
      );
      expect(allOptions.genres.map(({ name }) => name)).not.toContain(
        'Unrated Genre',
      );
      expect(allOptions.genres.map(({ id }) => id)).not.toContain(
        pinnedOnlyGenreId,
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
      await getClient().query(
        `INSERT INTO rate (id, "discId", "userId", rate)
         VALUES ('00000000-0000-4000-8000-000000000114', $1,
           '00000000-0000-4000-8000-000000000124', 0)`,
        [DISC_IDS[8]],
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

  it('records ANALYZE and BUFFERS plans for ranking and dynamic options at several periods', async () => {
    await clearFixtures();
    await getClient().query(
      `INSERT INTO country (id, name, "isoCode") VALUES
        ('00000000-0000-4000-8000-000000000051', 'Benchland A', 'BA'),
        ('00000000-0000-4000-8000-000000000052', 'Benchland B', 'BB');
       INSERT INTO artist (id, name, "countryId") VALUES
        ('00000000-0000-4000-8000-000000000053', 'Bench Artist A', '00000000-0000-4000-8000-000000000051'),
        ('00000000-0000-4000-8000-000000000054', 'Bench Artist B', '00000000-0000-4000-8000-000000000052');
       INSERT INTO genre (id, name, color) VALUES
        ('00000000-0000-4000-8000-000000000055', 'Bench Genre A', '#000'),
        ('00000000-0000-4000-8000-000000000056', 'Bench Genre B', '#fff');`,
    );
    await getClient().query(
      `INSERT INTO disc
        (id, name, "releaseDate", pinned, "artistId", "genreId")
       SELECT
         ('00000000-0000-4000-8000-' || lpad((1000 + n)::text, 12, '0'))::uuid,
         'Bench disc ' || n,
         CASE
           WHEN n <= 10 THEN DATE '2024-05-03'
           WHEN n <= 1510 THEN DATE '2024-06-10' + ((n - 11) % 7)
           ELSE DATE '2016-01-01' + ((n - 1511) % 2922)
         END,
         (n % 3 = 0),
         CASE WHEN n % 2 = 0
           THEN '00000000-0000-4000-8000-000000000053'::uuid
           ELSE '00000000-0000-4000-8000-000000000054'::uuid
         END,
         CASE WHEN n % 2 = 0
           THEN '00000000-0000-4000-8000-000000000055'::uuid
           ELSE '00000000-0000-4000-8000-000000000056'::uuid
         END
       FROM generate_series(1, 2500) AS series(n);

       INSERT INTO rate (id, "discId", "userId", rate, cover)
       SELECT
         ('00000000-0000-4000-8000-' || lpad((200000 + n * 10 + voter)::text, 12, '0'))::uuid,
         ('00000000-0000-4000-8000-' || lpad((1000 + n)::text, 12, '0'))::uuid,
         ('00000000-0000-4000-8000-' || lpad((300000 + n * 10 + voter)::text, 12, '0'))::uuid,
         ((n + voter) % 101)::numeric / 10,
         NULL
       FROM generate_series(1, 2500) AS disc_series(n)
       CROSS JOIN LATERAL generate_series(1, 1 + (n % 6)) AS voter_series(voter);
       ANALYZE country;
       ANALYZE artist;
       ANALYZE genre;
       ANALYZE disc;
       ANALYZE rate;`,
    );

    const planSummaries: {
      scenario: string;
      planningMs: unknown;
      executionMs: unknown;
      rootNode: unknown;
      actualRows: unknown;
      sharedHitBlocks: unknown;
      sharedReadBlocks: unknown;
      localHitBlocks: unknown;
      localReadBlocks: unknown;
    }[] = [];
    const explainAndSummarize = async (
      scenario: string,
      sql: string,
      params: unknown[],
    ) => {
      const result = await getClient().query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
        getHomePostgresValues(params),
      );
      const rawPlan = result.rows[0]?.['QUERY PLAN'];
      if (
        !Array.isArray(rawPlan) ||
        typeof rawPlan[0] !== 'object' ||
        rawPlan[0] === null
      ) {
        throw new Error(`PostgreSQL no devolvió un plan JSON para ${scenario}`);
      }
      const explainRow = rawPlan[0] as Record<string, unknown>;
      const rawRoot = explainRow.Plan;
      if (typeof rawRoot !== 'object' || rawRoot === null) {
        throw new Error(`Plan PostgreSQL sin nodo raíz para ${scenario}`);
      }
      const root = rawRoot as Record<string, unknown>;
      planSummaries.push({
        scenario,
        planningMs: explainRow['Planning Time'],
        executionMs: explainRow['Execution Time'],
        rootNode: root['Node Type'],
        actualRows: root['Actual Rows'],
        sharedHitBlocks: root['Shared Hit Blocks'],
        sharedReadBlocks: root['Shared Read Blocks'],
        localHitBlocks: root['Local Hit Blocks'],
        localReadBlocks: root['Local Read Blocks'],
      });
    };

    async function explainRanking(
      scenario: string,
      dateRange?: [string, string],
      country?: string,
      genreId?: string,
    ) {
      jest.useFakeTimers().setSystemTime(new Date('2024-12-31T12:00:00.000Z'));
      try {
        const repository: HomeQueryRunner = {
          query: async (sql, params = []) => {
            if (sql.includes('AS "weightedScore"')) {
              const rows = await getClient().query(
                sql,
                getHomePostgresValues(params),
              );
              await explainAndSummarize(`${scenario} ranking`, sql, params);
              return rows.rows;
            }
            return [];
          },
        };
        await new DiscTopService(repository).getTopDiscs(
          Object.assign(new TopStatsQueryDto(), {
            ...(dateRange
              ? {
                  dateRange: dateRange.map((date) => new Date(date)),
                }
              : {}),
            country,
          }),
          homeUser(),
          genreId,
        );
      } finally {
        jest.useRealTimers();
      }
    }

    async function explainOptions(
      scenario: string,
      dateRange?: [string, string],
      countryId?: string,
      genreId?: string,
    ) {
      jest.useFakeTimers().setSystemTime(new Date('2024-12-31T12:00:00.000Z'));
      try {
        const repository: HomeQueryRunner = {
          query: async (sql, params = []) => {
            const rows = await getClient().query(
              sql,
              getHomePostgresValues(params),
            );
            await explainAndSummarize(`${scenario} options`, sql, params);
            return rows.rows;
          },
        };
        await new DiscTopService(repository).getTopDiscOptions(
          Object.assign(new TopDiscOptionsQueryDto(), {
            ...(dateRange
              ? {
                  dateRange: dateRange.map((date) => new Date(date)),
                }
              : {}),
            countryId,
            genreId,
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    }

    const counts = await getClient().query(
      'SELECT (SELECT count(*)::integer FROM disc) AS discs, (SELECT count(*)::integer FROM rate) AS rates',
    );
    expect(Number(counts.rows[0].discs)).toBe(2500);
    expect(Number(counts.rows[0].rates)).toBeGreaterThan(8000);

    await explainRanking('semana pequeña', ['2024-05-01', '2024-05-07']);
    await explainRanking('semana grande', ['2024-06-10', '2024-06-16']);
    await explainRanking('año', ['2024-01-01', '2024-12-31']);
    await explainRanking('todos');
    await explainRanking(
      'país y género',
      ['2024-01-01', '2024-12-31'],
      'Benchland A',
      '00000000-0000-4000-8000-000000000055',
    );
    await explainOptions('año', ['2024-01-01', '2024-12-31']);
    await explainOptions('semana grande', ['2024-06-10', '2024-06-16']);
    await explainOptions('todos');
    await explainOptions(
      'país y género',
      ['2024-01-01', '2024-12-31'],
      '00000000-0000-4000-8000-000000000051',
      '00000000-0000-4000-8000-000000000055',
    );

    expect(planSummaries).toHaveLength(9);
    expect(
      planSummaries.every(({ executionMs }) => Number(executionMs) >= 0),
    ).toBe(true);
    console.log(`TOPDISCS_FIXTURE ${JSON.stringify(counts.rows[0])}`);
    console.log(`TOPDISCS_EXPLAIN ${JSON.stringify(planSummaries)}`);
  }, 120_000);
});
