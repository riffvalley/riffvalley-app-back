import { DataSource, EntitySchema } from 'typeorm';
import {
  buildMusicNameMultiColumnPartialPredicate,
  buildMusicNamePartialPredicate,
} from '../music-name-search';
import {
  HomePostgresClient,
  requireTopDiscsPostgresTestTarget,
  verifyTopDiscsPostgresTestIdentity,
} from '../../../discs/top/__tests__/home-postgres-types';

const describePostgres =
  process.env.MUSIC_SEARCH_PG_TEST === '1' ? describe : describe.skip;

class MusicSearchArtist {
  name!: string;
}
class MusicSearchDisc {
  name!: string;
}

describePostgres(
  'Catalog normalized music search PostgreSQL integration',
  () => {
    let dataSource: DataSource;
    let client: HomePostgresClient;

    beforeAll(async () => {
      const dotenv = await import('dotenv');
      dotenv.config();
      requireTopDiscsPostgresTestTarget('MUSIC_SEARCH_PG_TEST');
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

      dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        entities: [
          new EntitySchema<Record<string, unknown>>({
            name: 'MusicSearchArtist',
            target: MusicSearchArtist,
            tableName: 'artist',
            columns: {
              id: { type: 'uuid', primary: true },
              name: { type: 'text' },
              nameNormalized: { type: 'text', name: 'name_normalized' },
              searchNameNormalized: {
                type: 'text',
                name: 'search_name_normalized',
                nullable: true,
              },
            },
          }),
          new EntitySchema<Record<string, unknown>>({
            name: 'MusicSearchDisc',
            target: MusicSearchDisc,
            tableName: 'disc',
            columns: {
              id: { type: 'uuid', primary: true },
              name: { type: 'text' },
              searchNameNormalized: {
                type: 'text',
                name: 'search_name_normalized',
                nullable: true,
              },
              artistId: { type: 'uuid' },
            },
            relations: {
              artist: {
                type: 'many-to-one',
                target: () => MusicSearchArtist,
                joinColumn: { name: 'artistId' },
              },
            },
          }),
        ],
        synchronize: false,
        migrationsRun: false,
        extra: { max: 1 },
      });
      await dataSource.initialize();
      await dataSource.query(`
      CREATE TEMP TABLE artist (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        name_normalized text NOT NULL,
        search_name_normalized text NULL
      );
      CREATE TEMP TABLE disc (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        search_name_normalized text NULL,
        "artistId" uuid NOT NULL REFERENCES artist(id)
      );
      INSERT INTO artist VALUES
        ('00000000-0000-4000-8000-000000000001', 'MØL', 'møl', 'mol'),
        ('00000000-0000-4000-8000-000000000002', 'The Secrets Artist', 'the secrets artist', 'the secrets artist'),
        ('00000000-0000-4000-8000-000000000003', 'Legacy Artist', 'legacy artist', NULL);
      INSERT INTO disc VALUES
        ('00000000-0000-4000-8000-000000000011', 'The Secrets of Pandora', 'the secrets of pandora', '00000000-0000-4000-8000-000000000002'),
        ('00000000-0000-4000-8000-000000000014', 'Secrets of Pandora', 'secrets of pandora', '00000000-0000-4000-8000-000000000002'),
        ('00000000-0000-4000-8000-000000000012', 'Echo_% recording', NULL, '00000000-0000-4000-8000-000000000003'),
        ('00000000-0000-4000-8000-000000000013', 'EchoXY recording', NULL, '00000000-0000-4000-8000-000000000003');
    `);
    });

    afterAll(async () => {
      if (dataSource?.isInitialized) await dataSource.destroy();
      if (client) await client.end();
    });

    it('finds normalized artist/disc keys and aligns paginated rows with totals', async () => {
      const artistSearch = buildMusicNamePartialPredicate(
        'MOL',
        'artist.search_name_normalized',
        'artist.name_normalized',
        'mol',
      );
      const artists = await dataSource
        .getRepository(MusicSearchArtist)
        .createQueryBuilder('artist')
        .where(artistSearch.predicate, artistSearch.parameters)
        .getManyAndCount();
      expect(artists[1]).toBe(1);
      expect(artists[0][0]).toMatchObject({ name: 'MØL' });

      const discSearch = buildMusicNameMultiColumnPartialPredicate(
        'Secrets of Pandora',
        [
          {
            normalizedColumn: 'disc.search_name_normalized',
            legacyColumn: 'disc.name',
            legacyValue: 'Secrets of Pandora',
            legacyOperator: 'ILIKE',
          },
          {
            normalizedColumn: 'artist.search_name_normalized',
            legacyColumn: 'artist.name_normalized',
            legacyValue: 'secrets of pandora',
            legacyOperator: 'ILIKE',
          },
        ],
      );
      const page = await dataSource
        .getRepository(MusicSearchDisc)
        .createQueryBuilder('disc')
        .innerJoin('disc.artist', 'artist')
        .where(discSearch.predicate, discSearch.parameters)
        .orderBy('disc.name', 'ASC')
        .take(1)
        .skip(1)
        .getManyAndCount();
      expect(page[1]).toBe(2);
      expect(page[0]).toHaveLength(1);
      expect(page[0][0]?.name).toBe('The Secrets of Pandora');
    });

    it('uses NULL-only legacy fallback and treats LIKE metacharacters literally', async () => {
      const search = buildMusicNameMultiColumnPartialPredicate('Echo_%', [
        {
          normalizedColumn: 'disc.search_name_normalized',
          legacyColumn: 'disc.name',
          legacyValue: 'Echo_%',
          legacyOperator: 'ILIKE',
        },
      ]);
      const results = await dataSource
        .getRepository(MusicSearchDisc)
        .createQueryBuilder('disc')
        .where(search.predicate, search.parameters)
        .getManyAndCount();
      expect(results[1]).toBe(1);
      expect(results[0][0]?.name).toBe('Echo_% recording');
    });
  },
);
