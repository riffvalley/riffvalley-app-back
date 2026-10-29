import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Artist } from '../../../artists/entities/artist.entity';
import { Disc } from '../../entities/disc.entity';
import { DiscListSuggestionsService } from '../disc-list-suggestions.service';

const describePostgres =
  process.env.CATALOG_SUGGESTIONS_PG_TEST === '1' ? describe : describe.skip;

function id(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

describePostgres('DiscList suggestions PostgreSQL integration', () => {
  let client: import('pg').Client | undefined;
  let dataSource: DataSource | undefined;
  let schema: string | undefined;
  let service: DiscListSuggestionsService;

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
        'CATALOG_SUGGESTIONS_PG_TEST requires the disposable local Catalog PostgreSQL database.',
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

    schema = `cat_disc_suggestions_${randomUUID().replaceAll('-', '')}`;
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
      CREATE TABLE "${schema}".country (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        "isoCode" text NULL
      );
      CREATE TABLE "${schema}".artist (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        name_normalized text NOT NULL,
        search_name_normalized text NULL,
        image text NULL,
        "countryId" uuid NULL REFERENCES "${schema}".country(id)
      );
      CREATE TABLE "${schema}".disc (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        search_name_normalized text NULL,
        image text NULL,
        "releaseDate" date NULL,
        "artistId" uuid NOT NULL REFERENCES "${schema}".artist(id)
      );
    `);
    service = new DiscListSuggestionsService(
      dataSource.getRepository(Artist),
      dataSource.getRepository(Disc),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (client && schema) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    if (client) await client.end();
  });

  it('ranks exact and prefix matches, preserves homonyms by ID, and caps results without pagination', async () => {
    if (!client || !dataSource)
      throw new Error('PostgreSQL fixture is unavailable');
    await client.query(
      `INSERT INTO "${schema}".country (id, name, "isoCode") VALUES
        ($1, 'Norway', 'NO'),
        ($2, 'Sweden', 'SE')`,
      [id(40), id(41)],
    );
    await client.query(
      `INSERT INTO "${schema}".artist
        (id, name, name_normalized, search_name_normalized, image, "countryId") VALUES
        ($1, 'MØL', 'møl', 'mol', 'mol-norway.jpg', $5),
        ($2, 'MØL', 'møl', 'mol', 'mol-sweden.jpg', $6),
        ($3, 'Molar Field', 'molar field', 'molar field', NULL, NULL),
        ($4, 'Metal Artist', 'metal artist', 'metal artist', NULL, NULL)`,
      [id(10), id(11), id(12), id(13), id(40), id(41)],
    );
    await client.query(
      `INSERT INTO "${schema}".disc (id, name, search_name_normalized, image, "releaseDate", "artistId") VALUES
        ($1, 'Mol', 'mol', NULL, '2025-01-01', $5),
        ($2, 'Molar Field', 'molar field', 'cover.jpg', '2025-01-01', $6),
        ($3, 'Deep Record', 'deep record', NULL, '2025-01-01', $7),
        ($4, 'Molecule Future', 'molecule future', NULL, '2999-01-01', $5),
        ($8, 'Molecule Second', 'molecule second', NULL, '2025-01-01', $5),
        ($9, 'Molecule Third', 'molecule third', NULL, '2025-01-01', $5),
        ($10, 'Molecule Fourth', 'molecule fourth', NULL, '2025-01-01', $5)`,
      [
        id(20),
        id(21),
        id(22),
        id(23),
        id(10),
        id(12),
        id(13),
        id(24),
        id(25),
        id(26),
      ],
    );

    const suggestions = await service.findSuggestions('mol');
    expect(suggestions.artists).toHaveLength(3);
    expect(
      suggestions.artists.slice(0, 2).map(({ id: artistId }) => artistId),
    ).toEqual([id(10), id(11)]);
    expect(suggestions.artists.slice(0, 2)).toMatchObject([
      {
        name: 'MØL',
        image: 'mol-norway.jpg',
        country: { id: id(40), name: 'Norway', isoCode: 'NO' },
      },
      {
        name: 'MØL',
        image: 'mol-sweden.jpg',
        country: { id: id(41), name: 'Sweden', isoCode: 'SE' },
      },
    ]);
    expect(
      new Set(suggestions.artists.map(({ id: artistId }) => artistId)).size,
    ).toBe(suggestions.artists.length);
    expect(suggestions.discs).toHaveLength(5);
    expect(suggestions.discs[0]).toMatchObject({ id: id(20), title: 'Mol' });
    expect(suggestions.discs[4]).toMatchObject({
      id: id(21),
      title: 'Molar Field',
    });
    expect(suggestions.discs.some(({ id: discId }) => discId === id(23))).toBe(
      false,
    );
    expect(suggestions.discs[0]?.image).toBeNull();
  });

  it('deduplicates article variants and treats LIKE metacharacters literally for legacy keys', async () => {
    if (!client) throw new Error('PostgreSQL fixture is unavailable');
    await client.query(
      `INSERT INTO "${schema}".artist (id, name, name_normalized, search_name_normalized) VALUES
        ($1, 'The Cure', 'the cure', 'the cure'),
        ($2, 'Legacy Artist', 'legacy artist', NULL)`,
      [id(30), id(31)],
    );
    await client.query(
      `INSERT INTO "${schema}".disc (id, name, search_name_normalized, image, "releaseDate", "artistId") VALUES
        ($1, 'The Cure', 'the cure', NULL, '2025-01-01', $3),
        ($2, 'Echo_%', NULL, NULL, '2025-01-01', $4),
        ($5, 'EchoXY', NULL, NULL, '2025-01-01', $4)`,
      [id(32), id(33), id(30), id(31), id(34)],
    );

    const articleResults = await service.findSuggestions('the cure');
    expect(
      articleResults.artists.filter(({ id: artistId }) => artistId === id(30)),
    ).toHaveLength(1);
    expect(
      articleResults.discs.filter(({ id: discId }) => discId === id(32)),
    ).toHaveLength(1);

    const literalResults = await service.findSuggestions('Echo_%');
    expect(literalResults.discs.map(({ id: discId }) => discId)).toEqual([
      id(33),
    ]);
  });
});
