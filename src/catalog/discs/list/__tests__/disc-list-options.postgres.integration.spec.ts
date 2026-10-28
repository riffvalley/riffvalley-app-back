import { DataSource, EntitySchema } from 'typeorm';
import { DiscCatalogService } from '../../catalog/disc-catalog.service';
import {
  DiscListEligibility,
  DiscListMode,
  DiscListOptionsQueryDto,
} from '../dto/disc-list-contracts.dto';
import { RatesRandomSelectionService } from 'src/community/rates/random-selection/rates-random-selection.service';
import { RatesService } from 'src/community/rates/rates.service';
import { CommentsService } from 'src/community/comments/comments.service';
import { FavoritesService } from 'src/community/favorites/favorites.service';
import { PendingsService } from 'src/community/pendings/pendings.service';
import { User } from 'src/identity/auth/entities/user.entity';
import {
  HomePostgresClient,
  requireTopDiscsPostgresTestTarget,
  verifyTopDiscsPostgresTestIdentity,
} from '../../top/__tests__/home-postgres-types';

const describePostgres =
  process.env.DISC_LIST_OPTIONS_PG_TEST === '1' ? describe : describe.skip;
const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const COUNTRY_NO = '00000000-0000-4000-8000-000000000003';
const COUNTRY_SE = '00000000-0000-4000-8000-000000000004';
const GENRE_BLACK = '00000000-0000-4000-8000-000000000005';
const GENRE_DOOM = '00000000-0000-4000-8000-000000000006';
const ARTIST_ID = '00000000-0000-4000-8000-000000000007';
const ARTIST_SE_ID = '00000000-0000-4000-8000-000000000008';
const MISSING_ARTIST_ID = '00000000-0000-4000-8000-000000000009';

class SqlCountry {}
class SqlGenre {}
class SqlArtist {}
class SqlDisc {}
class SqlRate {}
class SqlComment {}
class SqlFavorite {}
class SqlPending {}

function id(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function sessionUser(idValue = USER_ID): User {
  return Object.assign(new User(), { id: idValue });
}

describePostgres('DiscList dynamic options PostgreSQL integration', () => {
  let dataSource: DataSource;
  let client: HomePostgresClient;
  let catalog: DiscCatalogService;
  let rates: RatesService;
  let comments: CommentsService;
  let favorites: FavoritesService;
  let pendings: PendingsService;

  beforeAll(async () => {
    const dotenv = await import('dotenv');
    dotenv.config();
    requireTopDiscsPostgresTestTarget('DISC_LIST_OPTIONS_PG_TEST');
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
    const optionEntities = [
      new EntitySchema<Record<string, unknown>>({
        name: 'Country',
        target: SqlCountry,
        tableName: 'country',
        columns: {
          id: { type: 'uuid', primary: true },
          name: { type: 'text' },
          isoCode: { type: 'text', nullable: true },
        },
      }),
      new EntitySchema<Record<string, unknown>>({
        name: 'Genre',
        target: SqlGenre,
        tableName: 'genre',
        columns: {
          id: { type: 'uuid', primary: true },
          name: { type: 'text' },
          color: { type: 'text', nullable: true },
        },
      }),
      new EntitySchema<Record<string, unknown>>({
        name: 'Artist',
        target: SqlArtist,
        tableName: 'artist',
        columns: {
          id: { type: 'uuid', primary: true },
          name: { type: 'text' },
          nameNormalized: { type: 'text', name: 'name_normalized' },
          countryId: { type: 'uuid', nullable: true },
        },
        relations: {
          country: {
            type: 'many-to-one',
            target: () => SqlCountry,
            joinColumn: { name: 'countryId' },
            nullable: true,
          },
        },
      }),
      new EntitySchema<Record<string, unknown>>({
        name: 'Disc',
        target: SqlDisc,
        tableName: 'disc',
        columns: {
          id: { type: 'uuid', primary: true },
          name: { type: 'text' },
          releaseDate: { type: 'date', nullable: true },
          image: { type: 'text', nullable: true },
          link: { type: 'text', nullable: true },
          ep: { type: 'boolean', nullable: true },
          debut: { type: 'boolean', nullable: true },
        },
        relations: {
          artist: {
            type: 'many-to-one',
            target: () => SqlArtist,
            joinColumn: { name: 'artistId' },
          },
          genre: {
            type: 'many-to-one',
            target: () => SqlGenre,
            joinColumn: { name: 'genreId' },
            nullable: true,
          },
          rates: {
            type: 'one-to-many',
            target: () => SqlRate,
            inverseSide: 'disc',
          },
        },
      }),
      new EntitySchema<Record<string, unknown>>({
        name: 'Rate',
        target: SqlRate,
        tableName: 'rate',
        columns: {
          id: { type: 'uuid', primary: true },
          userId: { type: 'uuid' },
          rate: { type: 'numeric', nullable: true },
          cover: { type: 'numeric', nullable: true },
        },
        relations: {
          disc: {
            type: 'many-to-one',
            target: () => SqlDisc,
            joinColumn: { name: 'discId' },
            inverseSide: 'rates',
          },
        },
      }),
      new EntitySchema<Record<string, unknown>>({
        name: 'Comment',
        target: SqlComment,
        tableName: 'comment',
        columns: {
          id: { type: 'uuid', primary: true },
          userId: { type: 'uuid' },
          comment: { type: 'text', nullable: true },
          createdAt: { type: 'timestamp' },
        },
        relations: {
          disc: {
            type: 'many-to-one',
            target: () => SqlDisc,
            joinColumn: { name: 'discId' },
          },
        },
      }),
      new EntitySchema<Record<string, unknown>>({
        name: 'Favorite',
        target: SqlFavorite,
        tableName: 'favorite',
        columns: {
          id: { type: 'uuid', primary: true },
          userId: { type: 'uuid' },
          createdAt: { type: 'timestamp', nullable: true },
        },
        relations: {
          disc: {
            type: 'many-to-one',
            target: () => SqlDisc,
            joinColumn: { name: 'discId' },
          },
        },
      }),
      new EntitySchema<Record<string, unknown>>({
        name: 'Pending',
        target: SqlPending,
        tableName: 'pending',
        columns: {
          id: { type: 'uuid', primary: true },
          userId: { type: 'uuid' },
          createdAt: { type: 'timestamp', nullable: true },
        },
        relations: {
          disc: {
            type: 'many-to-one',
            target: () => SqlDisc,
            joinColumn: { name: 'discId' },
          },
        },
      }),
    ];
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      entities: optionEntities,
      synchronize: false,
      migrationsRun: false,
      extra: { max: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TEMP TABLE country (id uuid PRIMARY KEY, name text, "isoCode" text);
      CREATE TEMP TABLE artist (id uuid PRIMARY KEY, name text, name_normalized text, "countryId" uuid);
      CREATE TEMP TABLE genre (id uuid PRIMARY KEY, name text, color text);
      CREATE TEMP TABLE disc (
        id uuid PRIMARY KEY, name text, "releaseDate" date, "artistId" uuid,
        "genreId" uuid, image text, link text, ep boolean, debut boolean
      );
      CREATE TEMP TABLE rate (id uuid PRIMARY KEY, "discId" uuid, "userId" uuid, rate numeric, cover numeric);
      CREATE TEMP TABLE comment (id uuid PRIMARY KEY, "discId" uuid, "userId" uuid, comment text, "createdAt" timestamp);
      CREATE TEMP TABLE favorite (id uuid PRIMARY KEY, "discId" uuid, "userId" uuid, "createdAt" timestamp);
      CREATE TEMP TABLE pending (id uuid PRIMARY KEY, "discId" uuid, "userId" uuid, "createdAt" timestamp);
    `);
    catalog = Object.create(DiscCatalogService.prototype) as DiscCatalogService;
    Reflect.set(catalog, 'discRepository', dataSource.getRepository(SqlDisc));
    Reflect.set(
      catalog,
      'ratesRandomSelectionService',
      new RatesRandomSelectionService(),
    );
    rates = Object.create(RatesService.prototype) as RatesService;
    Reflect.set(rates, 'rateRepository', dataSource.getRepository(SqlRate));
    comments = Object.create(CommentsService.prototype) as CommentsService;
    Reflect.set(
      comments,
      'commentRepository',
      dataSource.getRepository(SqlComment),
    );
    favorites = Object.create(FavoritesService.prototype) as FavoritesService;
    Reflect.set(
      favorites,
      'favoriteRepository',
      dataSource.getRepository(SqlFavorite),
    );
    pendings = Object.create(PendingsService.prototype) as PendingsService;
    Reflect.set(
      pendings,
      'pendingRepository',
      dataSource.getRepository(SqlPending),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (client) await client.end();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE pending, favorite, comment, rate, disc, genre, artist, country',
    );
    await dataSource.query(
      `INSERT INTO country (id, name, "isoCode") VALUES ($1, 'Norway', 'NO'), ($2, 'Sweden', 'SE')`,
      [COUNTRY_NO, COUNTRY_SE],
    );
    await dataSource.query(
      `INSERT INTO artist (id, name, name_normalized, "countryId") VALUES ($1, 'Norway Artist', 'norway artist', $2), ($3, 'No Country Artist', 'no country artist', NULL), ($4, 'Sweden Artist', 'sweden artist', $5)`,
      [ARTIST_ID, COUNTRY_NO, MISSING_ARTIST_ID, ARTIST_SE_ID, COUNTRY_SE],
    );
    await dataSource.query(
      `INSERT INTO genre (id, name, color) VALUES ($1, 'Black Metal', '#000'), ($2, 'Doom', NULL)`,
      [GENRE_BLACK, GENRE_DOOM],
    );
    for (let index = 1; index <= 25; index += 1) {
      await dataSource.query(
        `INSERT INTO disc (id, name, "releaseDate", "artistId", "genreId", image, link, ep, debut)
         VALUES ($1, $2, DATE '2026-06-01', $3, $4, NULL, NULL, false, false)`,
        [
          id(index),
          `Option fixture ${index}`,
          index === 25
            ? MISSING_ARTIST_ID
            : index >= 11 && index <= 20
              ? ARTIST_SE_ID
              : ARTIST_ID,
          index % 2 === 0 ? GENRE_DOOM : GENRE_BLACK,
        ],
      );
    }
    for (let index = 1; index <= 25; index += 1) {
      await dataSource.query(
        'INSERT INTO favorite (id, "discId", "userId") VALUES ($1, $2, $3)',
        [id(100 + index), id(index), USER_ID],
      );
      if (index <= 10) {
        await dataSource.query(
          'INSERT INTO rate (id, "discId", "userId", rate, cover) VALUES ($1, $2, $3, $4, NULL)',
          [id(200 + index), id(index), USER_ID, index],
        );
      }
      if (index >= 11 && index <= 20) {
        await dataSource.query(
          'INSERT INTO rate (id, "discId", "userId", rate, cover) VALUES ($1, $2, $3, NULL, $4)',
          [id(200 + index), id(index), USER_ID, index],
        );
      }
    }
    await dataSource.query(
      `INSERT INTO disc (id, name, "releaseDate", "artistId", "genreId", image, link, ep, debut)
       VALUES ($1, 'No genre fixture', DATE '2026-06-01', $2, NULL, NULL, NULL, false, false)`,
      [id(26), ARTIST_SE_ID],
    );
    await dataSource.query(
      'INSERT INTO favorite (id, "discId", "userId") VALUES ($1, $2, $3)',
      [id(126), id(26), USER_ID],
    );
    await dataSource.query(
      'INSERT INTO favorite (id, "discId", "userId") VALUES ($1, $2, $3)',
      [id(301), id(25), OTHER_USER_ID],
    );
    await dataSource.query(
      `INSERT INTO comment (id, "discId", "userId", comment, "createdAt")
       VALUES ($1, $2, $3, 'first', now()), ($4, $2, $3, 'second', now()), ($5, $6, $3, NULL, now())`,
      [id(401), id(1), USER_ID, id(402), id(403), id(2)],
    );
    await dataSource.query(
      'INSERT INTO pending (id, "discId", "userId") VALUES ($1, $2, $3)',
      [id(501), id(3), USER_ID],
    );
  });

  it('returns complete, cross-filtered options for all six authenticated modes', async () => {
    const countryAndGenreQuery = Object.assign(new DiscListOptionsQueryDto(), {
      query: 'Option fixture',
      dateRange: [new Date('2026-06-01'), new Date('2026-06-30')] as [
        Date,
        Date,
      ],
      countryId: COUNTRY_NO,
      genreId: GENRE_BLACK,
    });
    const modes = [
      {
        mode: DiscListMode.ALL,
        countries: ['Norway', 'Sweden'],
        genres: ['Black Metal', 'Doom'],
      },
      {
        mode: DiscListMode.RATES,
        countries: ['Norway'],
        genres: ['Black Metal', 'Doom'],
      },
      { mode: DiscListMode.COVERS, countries: ['Sweden'], genres: [] },
      {
        mode: DiscListMode.COMMENTS,
        countries: ['Norway'],
        genres: ['Black Metal'],
      },
      {
        mode: DiscListMode.FAVORITES,
        countries: ['Norway', 'Sweden'],
        genres: ['Black Metal', 'Doom'],
      },
      {
        mode: DiscListMode.PENDIENTES,
        countries: ['Norway'],
        genres: ['Black Metal'],
      },
    ];

    for (const {
      mode,
      countries: expectedCountries,
      genres: expectedGenres,
    } of modes) {
      const query = Object.assign(new DiscListOptionsQueryDto(), {
        ...countryAndGenreQuery,
        mode,
      });
      const result =
        mode === DiscListMode.ALL
          ? await catalog.findDiscListOptions(query, sessionUser())
          : mode === DiscListMode.RATES
            ? await rates.findDiscListOptions(query, sessionUser(), 'rate')
            : mode === DiscListMode.COVERS
              ? await rates.findDiscListOptions(query, sessionUser(), 'cover')
              : mode === DiscListMode.COMMENTS
                ? await comments.findDiscListOptions(query, sessionUser())
                : mode === DiscListMode.FAVORITES
                  ? await favorites.findDiscListOptions(query, sessionUser())
                  : await pendings.findDiscListOptions(query, sessionUser());

      expect(result.countries.map(({ name }) => name)).toEqual(
        expectedCountries,
      );
      expect(result.genres.map(({ name }) => name)).toEqual(expectedGenres);
    }

    const fullFavorites = await favorites.findDiscListOptions(
      Object.assign(new DiscListOptionsQueryDto(), {
        query: 'Option fixture',
        dateRange: countryAndGenreQuery.dateRange,
      }),
      sessionUser(),
    );
    expect(fullFavorites.countries).toHaveLength(2);
    expect(fullFavorites.genres).toHaveLength(2);
    expect(fullFavorites.genres.map(({ name }) => name)).toEqual([
      'Black Metal',
      'Doom',
    ]);
    const otherUsersFavorites = await favorites.findDiscListOptions(
      new DiscListOptionsQueryDto(),
      sessionUser(OTHER_USER_ID),
    );
    expect(otherUsersFavorites).toEqual({
      countries: [],
      genres: [
        expect.objectContaining({ id: GENRE_BLACK, name: 'Black Metal' }),
      ],
    });
  });

  it('keeps rate and cover eligibility separate, ignores other users, and deduplicates comments', async () => {
    const criteria = Object.assign(new DiscListOptionsQueryDto(), {
      genreId: GENRE_BLACK,
    });
    const musical = await rates.findDiscListOptions(
      criteria,
      sessionUser(),
      'rate',
    );
    const cover = await rates.findDiscListOptions(
      criteria,
      sessionUser(),
      'cover',
    );
    const commentsOptions = await comments.findDiscListOptions(
      new DiscListOptionsQueryDto(),
      sessionUser(),
    );

    expect(musical.countries.map(({ id: countryId }) => countryId)).toEqual([
      COUNTRY_NO,
    ]);
    expect(cover.countries.map(({ id: countryId }) => countryId)).toEqual([
      COUNTRY_SE,
    ]);
    expect(commentsOptions.countries).toHaveLength(1);
    expect(commentsOptions.genres).toHaveLength(1);
    expect(commentsOptions.genres[0]?.id).toBe(GENRE_BLACK);
  });

  it('honors the all-mode unvoted filters and returns empty dimensions for empty owners', async () => {
    const unvoted = await catalog.findDiscListOptions(
      Object.assign(new DiscListOptionsQueryDto(), {
        mode: DiscListMode.ALL,
        eligibility: DiscListEligibility.UNVOTED_RATE,
      }),
      sessionUser(),
    );
    const emptyPending = await pendings.findDiscListOptions(
      Object.assign(new DiscListOptionsQueryDto(), { query: 'no match' }),
      sessionUser(),
    );

    expect(unvoted.countries).toHaveLength(2);
    expect(unvoted.genres).toHaveLength(2);
    expect(emptyPending).toEqual({ countries: [], genres: [] });
  });
});
