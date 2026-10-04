import { Repository } from 'typeorm';
import { User } from '../../../auth/entities/user.entity';
import { Disc } from '../../entities/disc.entity';
import { DiscHomeService } from '../disc-home.service';

const describePostgres = process.env.D32_POSTGRES_TEST === '1' ? describe : describe.skip;
const USER_ID = '00000000-0000-4000-8000-000000000001';
const ARTIST_ID = '00000000-0000-4000-8000-000000000002';
const COUNTRY_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_COUNTRY_ID = '00000000-0000-4000-8000-000000000004';
const GENRE_ID = '00000000-0000-4000-8000-000000000005';
const OTHER_GENRE_ID = '00000000-0000-4000-8000-000000000006';
const DISC_IDS = Array.from({ length: 10 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
);

describePostgres('home disc ranking with PostgreSQL fixtures', () => {
  let client: any;

  beforeAll(async () => {
    require('dotenv').config();
    if (process.env.STAGE !== 'dev') {
      throw new Error('D32 PostgreSQL tests require STAGE=dev');
    }

    const { Client } = require('pg');
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    await client.query(`
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
    await client.query('TRUNCATE comment, pending, favorite, rate, disc, genre, artist, country');
  }

  async function seedBaseFixtures() {
    await clearFixtures();
    await client.query(
      `INSERT INTO country (id, name, "isoCode") VALUES
        ($1, 'Fixtureland', 'FX'), ($2, 'Otherland', 'OT')`,
      [COUNTRY_ID, OTHER_COUNTRY_ID],
    );
    await client.query(
      `INSERT INTO artist (id, name, "countryId") VALUES
        ($1, 'Fixture Artist', $2), ($3, 'Other Artist', $4)`,
      [ARTIST_ID, COUNTRY_ID, '00000000-0000-4000-8000-000000000007', OTHER_COUNTRY_ID],
    );
    await client.query(
      `INSERT INTO genre (id, name, color) VALUES
        ($1, 'Fixture Genre', '#000'), ($2, 'Other Genre', '#fff')`,
      [GENRE_ID, OTHER_GENRE_ID],
    );
    await client.query(
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
    await client.query(
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
    await client.query(
      `INSERT INTO favorite (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000201', $1, $2)`,
      [DISC_IDS[0], USER_ID],
    );
    await client.query(
      `INSERT INTO pending (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000301', $1, $2)`,
      [DISC_IDS[0], USER_ID],
    );
  }

  async function runHomeDiscs(
    today: string,
    dateRange: [string, string] = ['2020-01-01', '2025-12-31'],
  ) {
    jest.useFakeTimers().setSystemTime(new Date(`${today}T12:00:00.000Z`));
    const queries: { sql: string; params: unknown[]; rows?: any[] }[] = [];
    const repository = {
      query: async (sql: string, params: unknown[] = []) => {
        const call: { sql: string; params: unknown[]; rows?: any[] } = { sql, params };
        queries.push(call);
        if (sql.includes('AVG(avgRates)')) {
          call.rows = (await client.query(sql, params as any[])).rows;
          return call.rows;
        }
        if (sql.includes('AS "weightedScore"')) {
          call.rows = (await client.query(sql, params as any[])).rows;
          return call.rows;
        }
        return [];
      },
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalVotes: '0' }),
      }),
    };
    const service = new DiscHomeService(repository as unknown as Repository<Disc>);

    try {
      const result = await service.findTopRatedOrFeaturedAndStats(
        { dateRange, country: 'Fixtureland' } as any,
        { id: USER_ID } as User,
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

    const globalQuery = queries.find(({ sql }) => sql.includes('AVG(avgRates)'))!;
    expect(globalQuery.sql).toContain('WHERE d."releaseDate" BETWEEN $1 AND $2 AND d."releaseDate" <= $3 AND d."genreId" = $4 AND c.name = $5');
    expect(main.sql).toContain('WHERE d."releaseDate" BETWEEN $2 AND $3 AND d."releaseDate" <= $4 AND d."genreId" = $5 AND c.name = $6');
    expect(main.sql).toContain('LEFT JOIN artist a ON d."artistId" = a.id');
    expect(main.sql).toContain('LEFT JOIN country c ON a."countryId" = c.id');
    expect(main.sql).toContain('LEFT JOIN genre g ON d."genreId" = g.id');
    expect(main.sql).toContain('LEFT JOIN rate r ON d.id = r."discId"');
    expect(main.sql).toContain('HAVING COUNT(CASE WHEN r.rate IS NOT NULL THEN 1 END) > 0 OR d."pinned" = true');
    expect(main.sql).toContain('ORDER BY "weightedScore" DESC\n      LIMIT 20;');
    expect(main.sql).not.toMatch(/ORDER BY "weightedScore" DESC\s*,/);
  });

  it('includes a disc at the inclusive dateRange upper bound when today is later', async () => {
    await seedBaseFixtures();
    const { main } = await runHomeDiscs(
      '2025-12-31',
      ['2020-01-01', '2024-12-31'],
    );

    expect(main.rows!.map(({ id }) => id)).toContain(DISC_IDS[4]);
  });

  it('limits 25 equal-score pinned discs to 20 without promising a tie order', async () => {
    await clearFixtures();
    await client.query(
      `INSERT INTO country (id, name, "isoCode") VALUES ($1, 'Fixtureland', 'FX')`,
      [COUNTRY_ID],
    );
    await client.query(
      `INSERT INTO artist (id, name, "countryId") VALUES ($1, 'Fixture Artist', $2)`,
      [ARTIST_ID, COUNTRY_ID],
    );
    await client.query(
      `INSERT INTO genre (id, name, color) VALUES ($1, 'Fixture Genre', '#000')`,
      [GENRE_ID],
    );
    await client.query(
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
    expect(main.sql).toContain('ORDER BY "weightedScore" DESC\n      LIMIT 20;');
  });

  it('characterizes duplicate rows when duplicate favorites split a disc by favorite ID', async () => {
    await seedBaseFixtures();
    await client.query(
      `INSERT INTO favorite (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000202', $1, $2);`,
      [DISC_IDS[0], USER_ID],
    );

    const { main } = await runHomeDiscs('2024-12-31');
    const ratedDiscRows = main.rows!.filter(({ id }) => id === DISC_IDS[0]);

    expect(ratedDiscRows).toHaveLength(2);
    expect(ratedDiscRows.map(({ voteCount }) => Number(voteCount))).toEqual([2, 2]);
  });

  it('characterizes rating-count multiplication when duplicate pendings are not grouped', async () => {
    await seedBaseFixtures();
    await client.query(
      `INSERT INTO pending (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000302', $1, $2);`,
      [DISC_IDS[0], USER_ID],
    );

    const { main } = await runHomeDiscs('2024-12-31');
    const ratedDiscRows = main.rows!.filter(({ id }) => id === DISC_IDS[0]);

    expect(ratedDiscRows).toHaveLength(1);
    expect(Number(ratedDiscRows[0].voteCount)).toBe(4);
    expect(Number(ratedDiscRows[0].weightedScore)).toBeCloseTo(2.5);
  });
});
