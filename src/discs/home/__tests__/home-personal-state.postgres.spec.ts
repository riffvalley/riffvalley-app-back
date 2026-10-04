import { Repository } from 'typeorm';
import { User } from '../../../auth/entities/user.entity';
import { Disc } from '../../entities/disc.entity';
import { DiscHomeService } from '../disc-home.service';

const describePostgres = process.env.D33_POSTGRES_TEST === '1' ? describe : describe.skip;
const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const THIRD_USER_ID = '00000000-0000-4000-8000-000000000007';
const ARTIST_ID = '00000000-0000-4000-8000-000000000003';
const COUNTRY_ID = '00000000-0000-4000-8000-000000000004';
const GENRE_ID = '00000000-0000-4000-8000-000000000005';
const DISC_ID = '00000000-0000-4000-8000-000000000006';

describePostgres('home personal state with PostgreSQL fixtures', () => {
  let client: any;

  beforeAll(async () => {
    require('dotenv').config();
    if (process.env.STAGE !== 'dev') {
      throw new Error('D33 PostgreSQL tests require STAGE=dev');
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

  beforeEach(async () => {
    await client.query('TRUNCATE comment, pending, favorite, rate, disc, genre, artist, country');
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
      `INSERT INTO disc
        (id, name, "releaseDate", pinned, "artistId", "genreId", description, image, verified, ep, debut, link, featured)
      VALUES ($1, 'State fixture', DATE '2022-01-01', true, $2, $3, NULL, NULL, false, false, false, NULL, false)`,
      [DISC_ID, ARTIST_ID, GENRE_ID],
    );
  });

  async function insertRate(id: string, userId: string, rate: number | null, cover: number | null) {
    await client.query(
      'INSERT INTO rate (id, "discId", "userId", rate, cover) VALUES ($1, $2, $3, $4, $5)',
      [id, DISC_ID, userId, rate, cover],
    );
  }

  async function runHome() {
    const queries: { sql: string; params: unknown[]; rows?: any[] }[] = [];
    const repository = {
      query: async (sql: string, params: unknown[] = []) => {
        const call: { sql: string; params: unknown[]; rows?: any[] } = { sql, params };
        queries.push(call);
        if (sql.includes('AVG(avgRates)') || sql.includes('AS "weightedScore"')) {
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
    const result = await service.findTopRatedOrFeaturedAndStats(
      { dateRange: ['2020-01-01', '2025-12-31'] } as any,
      { id: USER_ID } as User,
    );
    const main = queries.find(({ sql }) => sql.includes('AS "weightedScore"'))!;
    return { result, main };
  }

  it('selects personal state with correlated LIMIT 1 subqueries and keeps other users out of those fields', async () => {
    await insertRate('00000000-0000-4000-8000-000000000101', OTHER_USER_ID, 4, 2);
    await insertRate('00000000-0000-4000-8000-000000000102', THIRD_USER_ID, 3, 1);
    await client.query(
      'INSERT INTO favorite (id, "discId", "userId") VALUES ($1, $2, $3)',
      ['00000000-0000-4000-8000-000000000201', DISC_ID, OTHER_USER_ID],
    );
    await client.query(
      'INSERT INTO pending (id, "discId", "userId") VALUES ($1, $2, $3)',
      ['00000000-0000-4000-8000-000000000301', DISC_ID, OTHER_USER_ID],
    );

    const { result, main } = await runHome();
    const disc = result.discs[0] as any;

    expect(result.discs).toHaveLength(1);
    expect(disc.userRate).toBeNull();
    expect(disc.favoriteId).toBeNull();
    expect(disc.pendingId).toBeNull();
    expect(Number(disc.voteCount)).toBe(2);
    expect(main.sql).toContain('(SELECT r.id FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userRateId"');
    expect(main.sql).toContain('(SELECT f.id FROM favorite f WHERE f."discId" = d.id AND f."userId" = $1 LIMIT 1) AS "userFavoriteId"');
    expect(main.sql).toContain('(SELECT p.id FROM pending p WHERE p."discId" = d.id AND p."userId" = $1 LIMIT 1) AS "pendingId"');
    expect(main.sql).toContain('(SELECT r.rate FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userRate"');
    expect(main.sql).toContain('(SELECT r.cover FROM rate r WHERE r."discId" = d.id AND r."userId" = $1 LIMIT 1) AS "userCover"');
    expect(main.sql).toContain('GROUP BY d.id, a.name, g.name, g.color, f.id, c.id, c.name, c."isoCode"');
    expect(main.sql).not.toContain('GROUP BY d.id, a.name, g.name, g.color, f.id, p.id');
  });

  it('maps a current-user rate and cover, while NULL rate values still produce a userRate object', async () => {
    await insertRate('00000000-0000-4000-8000-000000000102', USER_ID, 4.5, 3.25);
    const rated = await runHome();
    expect((rated.result.discs[0] as any).userRate).toEqual({
      id: '00000000-0000-4000-8000-000000000102',
      rate: 4.5,
      cover: 3.25,
    });

    await client.query('TRUNCATE rate');
    await insertRate('00000000-0000-4000-8000-000000000103', USER_ID, null, 4.75);
    const coverOnly = await runHome();
    expect((coverOnly.result.discs[0] as any).userRate).toEqual({
      id: '00000000-0000-4000-8000-000000000103',
      rate: null,
      cover: 4.75,
    });
  });

  it('maps favorite, pending, and their combination to one ranked disc', async () => {
    await client.query(
      'INSERT INTO favorite (id, "discId", "userId") VALUES ($1, $2, $3)',
      ['00000000-0000-4000-8000-000000000202', DISC_ID, USER_ID],
    );
    const favorite = await runHome();
    expect(favorite.result.discs).toHaveLength(1);
    expect((favorite.result.discs[0] as any).favoriteId).toBe('00000000-0000-4000-8000-000000000202');
    expect((favorite.result.discs[0] as any).pendingId).toBeNull();

    await client.query(
      'INSERT INTO pending (id, "discId", "userId") VALUES ($1, $2, $3)',
      ['00000000-0000-4000-8000-000000000302', DISC_ID, USER_ID],
    );
    const favoriteAndPending = await runHome();
    expect(favoriteAndPending.result.discs).toHaveLength(1);
    expect((favoriteAndPending.result.discs[0] as any).userRate).toBeNull();
    expect((favoriteAndPending.result.discs[0] as any).favoriteId).toBe('00000000-0000-4000-8000-000000000202');
    expect((favoriteAndPending.result.discs[0] as any).pendingId).toBe('00000000-0000-4000-8000-000000000302');

    await insertRate('00000000-0000-4000-8000-000000000104', USER_ID, 3, 2);
    const allStates = await runHome();
    expect(allStates.result.discs).toHaveLength(1);
    expect((allStates.result.discs[0] as any).userRate).toEqual({
      id: '00000000-0000-4000-8000-000000000104', rate: 3, cover: 2,
    });
    expect((allStates.result.discs[0] as any).favoriteId).toBe('00000000-0000-4000-8000-000000000202');
    expect((allStates.result.discs[0] as any).pendingId).toBe('00000000-0000-4000-8000-000000000302');
  });

  it('uses an unordered LIMIT 1 candidate for each personal rate alias when several rates exist', async () => {
    const rateIds = [
      '00000000-0000-4000-8000-000000000107',
      '00000000-0000-4000-8000-000000000108',
    ];
    await insertRate(rateIds[0], USER_ID, 2, 1);
    await insertRate(rateIds[1], USER_ID, 5, 4);

    const { result, main } = await runHome();
    const userRate = (result.discs[0] as any).userRate;

    expect(result.discs).toHaveLength(1);
    expect(rateIds).toContain(userRate.id);
    expect([2, 5]).toContain(userRate.rate);
    expect([1, 4]).toContain(userRate.cover);
    expect(main.sql.match(/SELECT r\.(?:id|rate|cover) FROM rate r WHERE r\."discId" = d\.id AND r\."userId" = \$1 LIMIT 1/g)).toHaveLength(3);
    expect(main.sql).not.toMatch(/SELECT r\.(?:id|rate|cover)[\s\S]{0,100}ORDER BY/);
  });

  it('preserves duplicate favorite output rows and the pending join fanout in aggregate values', async () => {
    await insertRate('00000000-0000-4000-8000-000000000105', OTHER_USER_ID, 4, null);
    await insertRate('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000007', 2, null);
    await client.query(
      `INSERT INTO disc (id, name, "releaseDate", pinned, "artistId", "genreId")
       VALUES ('00000000-0000-4000-8000-000000000009', 'Reference', DATE '2022-01-01', false, $1, $2)`,
      [ARTIST_ID, GENRE_ID],
    );
    await client.query(
      'INSERT INTO rate (id, "discId", "userId", rate, cover) VALUES ($1, $2, $3, 5, NULL)',
      ['00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000009', THIRD_USER_ID],
    );
    await client.query(`
      INSERT INTO favorite (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000203', $1, $2),
        ('00000000-0000-4000-8000-000000000204', $1, $2);
    `, [DISC_ID, USER_ID]);
    const duplicateFavorites = await runHome();
    const duplicateFavoriteRows = duplicateFavorites.result.discs.filter((row: any) => row.id === DISC_ID);
    expect(duplicateFavoriteRows).toHaveLength(2);
    expect(duplicateFavoriteRows.every((row: any) => [
      '00000000-0000-4000-8000-000000000203',
      '00000000-0000-4000-8000-000000000204',
    ].includes(row.favoriteId))).toBe(true);
    expect(duplicateFavoriteRows.map((row: any) => Number(row.voteCount))).toEqual([2, 2]);

    await client.query('TRUNCATE favorite');
    await client.query(`
      INSERT INTO pending (id, "discId", "userId") VALUES
        ('00000000-0000-4000-8000-000000000303', $1, $2),
        ('00000000-0000-4000-8000-000000000304', $1, $2);
    `, [DISC_ID, USER_ID]);
    const duplicatePendings = await runHome();
    const pendingDisc = duplicatePendings.result.discs.find((row: any) => row.id === DISC_ID) as any;
    expect(duplicatePendings.result.discs.filter((row: any) => row.id === DISC_ID)).toHaveLength(1);
    expect(Number(pendingDisc.voteCount)).toBe(4);
    expect(Number(pendingDisc.averageRate)).toBe(3);
    expect(Number(pendingDisc.weightedScore)).toBeCloseTo(3.2);
  });
});
