import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Artist } from '../../entities/artist.entity';
import { ArtistImageFillService } from '../artist-image-fill.service';
import { FillArtistImagesDto } from '../dto/fill-artist-images.dto';
import { SpotifyPublicApiService } from 'src/integrations/spotify-integration/api/spotify-public-api.service';

const describePostgres =
  process.env.CATALOG_ARTIST_IMAGE_FILL_PG_TEST === '1'
    ? describe
    : describe.skip;

function id(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

describePostgres('Artist image fill PostgreSQL integration', () => {
  let client: import('pg').Client | undefined;
  let dataSource: DataSource | undefined;
  let schema: string | undefined;

  beforeAll(async () => {
    const dotenv = await import('dotenv');
    dotenv.config();
    if (
      process.env.STAGE !== 'dev' ||
      process.env.DB_HOST !== '127.0.0.1' ||
      process.env.DB_PORT !== '55432' ||
      process.env.DB_NAME !== 'riffvalley_catalog_test_20261015' ||
      process.env.DB_USERNAME !== 'riffvalley_catalog_test' ||
      !process.env.CATALOG_TEST_DB_PASSWORD ||
      process.env.DATABASE_URL
    ) {
      throw new Error(
        'CATALOG_ARTIST_IMAGE_FILL_PG_TEST requires the disposable local Catalog PostgreSQL database.',
      );
    }
    process.env.DB_PASSWORD = process.env.CATALOG_TEST_DB_PASSWORD;

    const { Client } = await import('pg');
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
    });
    await client.connect();
    const identityResult = await client.query<{
      database: string;
      username: string;
      owner: string;
      port: number;
    }>(`
      SELECT current_database() AS database,
             current_user AS username,
             pg_get_userbyid(datdba) AS owner,
             inet_server_port() AS port
      FROM pg_database
      WHERE datname = current_database()
    `);
    const identity = identityResult.rows[0];
    if (
      identity?.database !== 'riffvalley_catalog_test_20261015' ||
      identity.username !== 'riffvalley_catalog_test' ||
      identity.owner !== 'riffvalley_catalog_test' ||
      Number(identity.port) !== 5432
    ) {
      throw new Error(
        'PostgreSQL identity did not match the disposable Catalog test database.',
      );
    }

    schema = `cat_artist_image_fill_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    const { default: configuredDataSource } = await import(
      '../../../../data-source'
    );
    dataSource = configuredDataSource;
    dataSource.setOptions({
      installExtensions: false,
      logging: false,
      migrations: [],
      migrationsRun: false,
      poolSize: 1,
      schema,
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TABLE "${schema}".artist (
        id uuid PRIMARY KEY,
        name varchar(100) NOT NULL,
        name_normalized text NOT NULL,
        search_name_normalized text NULL,
        description text NULL,
        image text NULL,
        "countryId" character varying NULL,
        "needsReview" boolean NOT NULL DEFAULT true,
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (client && schema) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });

  it('selects only missing images and preserves review/name fields on conditional updates', async () => {
    if (!client || !dataSource || !schema)
      throw new Error('PostgreSQL not initialized');
    await client.query(
      `INSERT INTO "${schema}".artist (id, name, name_normalized, search_name_normalized, image, "needsReview") VALUES
       ($1, 'Verified Artist', 'verified artist', 'verified artist', NULL, true),
       ($2, 'No Match Artist', 'no match artist', 'no match artist', '', false),
       ($3, 'Existing Artist', 'existing artist', 'existing artist', 'existing.jpg', true)`,
      [id(1), id(2), id(3)],
    );
    const spotify = {
      findArtistCandidates: jest.fn(async (name: string) =>
        name === 'Verified Artist'
          ? [
              {
                spotifyId: 'spotify-real-id',
                name: 'Verified Artist',
                imageUrl: 'verified.jpg',
                listenUrl: null,
                genres: [],
              },
            ]
          : [],
      ),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArtistImageFillService,
        {
          provide: getRepositoryToken(Artist),
          useValue: dataSource.getRepository(Artist),
        },
        { provide: SpotifyPublicApiService, useValue: spotify },
      ],
    }).compile();
    const service = moduleRef.get(ArtistImageFillService);
    const preview = await service.preview();
    expect(preview.eligible).toBe(2);
    const result = await service.fill(
      Object.assign(new FillArtistImagesDto(), {
        cursor: preview.startCursor ?? undefined,
        batchSize: 10,
      }),
    );

    expect(result).toMatchObject({
      processed: 2,
      updated: 1,
      notFound: 1,
      hasMore: false,
      nextCursor: null,
    });
    const rows = await client.query<{
      id: string;
      image: string | null;
      name_normalized: string;
      needsReview: boolean;
    }>(
      `SELECT id, image, name_normalized, "needsReview" FROM "${schema}".artist ORDER BY id`,
    );
    expect(rows.rows).toEqual([
      expect.objectContaining({
        id: id(1),
        image: 'verified.jpg',
        name_normalized: 'verified artist',
        needsReview: true,
      }),
      expect.objectContaining({
        id: id(2),
        image: '',
        name_normalized: 'no match artist',
        needsReview: false,
      }),
      expect.objectContaining({
        id: id(3),
        image: 'existing.jpg',
        needsReview: true,
      }),
    ]);
    await client.query(`DELETE FROM "${schema}".artist`);
    await moduleRef.close();
  });

  it('detects an image written concurrently while Spotify is being queried', async () => {
    if (!client || !dataSource || !schema)
      throw new Error('PostgreSQL not initialized');
    await client.query(
      `INSERT INTO "${schema}".artist (id, name, name_normalized, search_name_normalized, image) VALUES ($1, 'Race Artist', 'race artist', 'race artist', NULL)`,
      [id(4)],
    );
    const spotify = {
      findArtistCandidates: jest.fn(async () => {
        await client?.query(
          `UPDATE "${schema}".artist SET image = 'manual.jpg' WHERE id = $1`,
          [id(4)],
        );
        return [
          {
            spotifyId: 'spotify-real-id',
            name: 'Race Artist',
            imageUrl: 'spotify.jpg',
            listenUrl: null,
            genres: [],
          },
        ];
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArtistImageFillService,
        {
          provide: getRepositoryToken(Artist),
          useValue: dataSource.getRepository(Artist),
        },
        { provide: SpotifyPublicApiService, useValue: spotify },
      ],
    }).compile();
    const service = moduleRef.get(ArtistImageFillService);
    const preview = await service.preview();
    const result = await service.fill(
      Object.assign(new FillArtistImagesDto(), {
        cursor: preview.startCursor ?? undefined,
      }),
    );
    const stored = await client.query<{ image: string }>(
      `SELECT image FROM "${schema}".artist WHERE id = $1`,
      [id(4)],
    );

    expect(result).toMatchObject({
      processed: 1,
      concurrentUpdates: 1,
      updated: 0,
    });
    expect(stored.rows[0]?.image).toBe('manual.jpg');
    await moduleRef.close();
  });
});
