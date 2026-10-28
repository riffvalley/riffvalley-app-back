import { DataSource, QueryRunner } from 'typeorm';
import { AddMusicSearchNormalizedKeys1792020000000 } from '../1792020000000-AddMusicSearchNormalizedKeys';
import { runMusicSearchKeyBackfill } from '../../catalog/shared/music-name/music-search-key-backfill';

const databaseUrl = process.env.MEDIA_MUSIC_NAME_MIGRATION_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const testSchema = 'media_search_keys_migration_test';

function createDataSource(): DataSource {
  if (!databaseUrl) {
    throw new Error('MEDIA_MUSIC_NAME_MIGRATION_TEST_URL is required');
  }

  const url = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.pathname !== '/music_search_migration_test'
  ) {
    throw new Error(
      'MEDIA_MUSIC_NAME_MIGRATION_TEST_URL must target the local music_search_migration_test database',
    );
  }

  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [],
    migrations: [],
    logging: false,
  });
}

describePostgres('music search normalized keys PostgreSQL migration', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    dataSource = createDataSource();
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await queryRunner.query(`CREATE SCHEMA "${testSchema}"`);
    await queryRunner.query(`SET search_path TO "${testSchema}"`);
    await queryRunner.query(
      'CREATE TABLE "artist" ("id" uuid PRIMARY KEY, "name" varchar(100) NOT NULL, "name_normalized" text NOT NULL)',
    );
    await queryRunner.query(
      'CREATE TABLE "disc" ("id" uuid PRIMARY KEY, "name" varchar(100) NOT NULL)',
    );
    await queryRunner.query(
      `INSERT INTO "artist" ("id", "name", "name_normalized") VALUES ('00000000-0000-0000-0000-000000000001', 'MØL', 'legacy-mol')`,
    );
    await queryRunner.query(
      `INSERT INTO "disc" ("id", "name") VALUES ('00000000-0000-0000-0000-000000000002', 'The Secrets of Pandora')`,
    );
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
      await queryRunner.release();
      await dataSource.destroy();
    }
  });

  it('applies and reverts nullable columns while preserving legacy and original values', async () => {
    const migration = new AddMusicSearchNormalizedKeys1792020000000();

    await migration.up(queryRunner);

    const nullableColumns = await queryRunner.query(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'search_name_normalized' ORDER BY table_name`,
      [testSchema],
    );
    expect(nullableColumns).toEqual([
      {
        table_name: 'artist',
        column_name: 'search_name_normalized',
        is_nullable: 'YES',
      },
      {
        table_name: 'disc',
        column_name: 'search_name_normalized',
        is_nullable: 'YES',
      },
    ]);

    const historicalRows = await queryRunner.query(
      `SELECT "name", "name_normalized", "search_name_normalized" FROM "artist" UNION ALL SELECT "name", NULL, "search_name_normalized" FROM "disc" ORDER BY "name"`,
    );
    expect(historicalRows).toEqual([
      {
        name: 'MØL',
        name_normalized: 'legacy-mol',
        search_name_normalized: null,
      },
      {
        name: 'The Secrets of Pandora',
        name_normalized: null,
        search_name_normalized: null,
      },
    ]);

    await queryRunner.query(
      `INSERT INTO "artist" ("id", "name", "name_normalized", "search_name_normalized") VALUES ('00000000-0000-0000-0000-000000000003', 'Sólstafir', 'legacy-solstafir', 'solstafir')`,
    );
    await queryRunner.query(
      `INSERT INTO "disc" ("id", "name", "search_name_normalized") VALUES ('00000000-0000-0000-0000-000000000004', 'MØL', 'mol')`,
    );
    await queryRunner.query(
      `UPDATE "artist" SET "name" = 'MOL', "search_name_normalized" = 'mol' WHERE "id" = '00000000-0000-0000-0000-000000000003'`,
    );
    await queryRunner.query(
      `UPDATE "disc" SET "name" = 'Secrets of Pandora', "search_name_normalized" = 'secrets of pandora' WHERE "id" = '00000000-0000-0000-0000-000000000004'`,
    );

    await migration.down(queryRunner);

    const preservedRows = await queryRunner.query(
      `SELECT "name", "name_normalized" FROM "artist" WHERE "id" IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003') ORDER BY "id"`,
    );
    expect(preservedRows).toEqual([
      { name: 'MØL', name_normalized: 'legacy-mol' },
      { name: 'MOL', name_normalized: 'legacy-solstafir' },
    ]);
    const preservedDiscs = await queryRunner.query(
      `SELECT "name" FROM "disc" WHERE "id" IN ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004') ORDER BY "name"`,
    );
    expect(preservedDiscs).toEqual([
      { name: 'Secrets of Pandora' },
      { name: 'The Secrets of Pandora' },
    ]);
    const removedColumns = await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'search_name_normalized'`,
      [testSchema],
    );
    expect(removedColumns).toEqual([{ count: 0 }]);
  });

  it('backfills in batches, keeps dry-run read-only, resumes idempotently, and verifies against MEDIA-2', async () => {
    const migration = new AddMusicSearchNormalizedKeys1792020000000();
    await migration.up(queryRunner);
    await queryRunner.query(
      `INSERT INTO "artist" ("id", "name", "name_normalized") VALUES ('00000000-0000-0000-0000-000000000005', 'Sólstafir', 'legacy-solstafir'), ('00000000-0000-0000-0000-000000000006', 'Motörhead', 'legacy-motorhead'), ('00000000-0000-0000-0000-000000000007', 'Björk', 'legacy-bjork')`,
    );
    await queryRunner.query(
      `INSERT INTO "disc" ("id", "name") VALUES ('00000000-0000-0000-0000-000000000008', 'The Secrets of Pandora')`,
    );
    const run = (mode: 'dry-run' | 'apply' | 'verify') =>
      runMusicSearchKeyBackfill(
        (sql, parameters) => queryRunner.query(sql, parameters),
        testSchema,
        { mode, batchSize: 2 },
      );

    const dryRun = await run('dry-run');
    expect(dryRun.artist.candidates).toBe(4);
    expect(dryRun.artist.updated).toBe(0);
    expect(
      await queryRunner.query(
        `SELECT COUNT(*)::int AS count FROM "artist" WHERE "search_name_normalized" IS NOT NULL`,
      ),
    ).toEqual([{ count: 0 }]);

    const applyResult = await run('apply');
    expect(applyResult.artist.updated).toBe(4);
    expect(applyResult.disc.updated).toBe(2);
    expect((await run('apply')).artist.updated).toBe(0);
    const verified = await run('verify');
    expect(verified.artist.missing).toBe(0);
    expect(verified.artist.inconsistent).toBe(0);
    expect(verified.disc.missing).toBe(0);
    expect(verified.disc.inconsistent).toBe(0);

    const preservedRows = await queryRunner.query(
      `SELECT "name", "name_normalized", "search_name_normalized" FROM "artist" ORDER BY "name"`,
    );
    expect(preservedRows).toEqual([
      {
        name: 'Björk',
        name_normalized: 'legacy-bjork',
        search_name_normalized: 'bjork',
      },
      {
        name: 'MØL',
        name_normalized: 'legacy-mol',
        search_name_normalized: 'mol',
      },
      {
        name: 'Motörhead',
        name_normalized: 'legacy-motorhead',
        search_name_normalized: 'motorhead',
      },
      {
        name: 'Sólstafir',
        name_normalized: 'legacy-solstafir',
        search_name_normalized: 'solstafir',
      },
    ]);
    expect(
      await queryRunner.query(
        `SELECT "name", "search_name_normalized" FROM "disc" ORDER BY "name"`,
      ),
    ).toEqual([
      {
        name: 'The Secrets of Pandora',
        search_name_normalized: 'the secrets of pandora',
      },
      {
        name: 'The Secrets of Pandora',
        search_name_normalized: 'the secrets of pandora',
      },
    ]);
  });

  it('does not overwrite a key written concurrently after the backfill read', async () => {
    const migration = new AddMusicSearchNormalizedKeys1792020000000();
    await migration.up(queryRunner);
    let raced = false;
    const query = async (
      sql: string,
      parameters?: unknown[],
    ): Promise<unknown> => {
      if (sql.startsWith('UPDATE') && !raced) {
        raced = true;
        await queryRunner.query(
          `UPDATE "artist" SET "name" = 'MOL', "search_name_normalized" = 'mol' WHERE "id" = $1`,
          [parameters?.[1]],
        );
      }
      return queryRunner.query(sql, parameters);
    };

    const results = await runMusicSearchKeyBackfill(query, testSchema, {
      mode: 'apply',
      batchSize: 10,
    });
    expect(results.artist.updated).toBe(0);
    expect(results.artist.skippedConcurrent).toBe(1);
    expect(
      await queryRunner.query(
        `SELECT "name", "name_normalized", "search_name_normalized" FROM "artist" WHERE "id" = '00000000-0000-0000-0000-000000000001'`,
      ),
    ).toEqual([
      {
        name: 'MOL',
        name_normalized: 'legacy-mol',
        search_name_normalized: 'mol',
      },
    ]);
  });

  it('resumes from remaining NULL keys after a real PostgreSQL interruption', async () => {
    const migration = new AddMusicSearchNormalizedKeys1792020000000();
    await migration.up(queryRunner);
    await queryRunner.query(
      `INSERT INTO "artist" ("id", "name", "name_normalized") VALUES ('00000000-0000-0000-0000-000000000005', 'Sólstafir', 'legacy-solstafir')`,
    );
    let artistPages = 0;
    let interrupted = false;
    const query = async (
      sql: string,
      parameters?: unknown[],
    ): Promise<unknown> => {
      if (
        sql.startsWith('SELECT') &&
        sql.includes(`FROM "${testSchema}"."artist"`)
      ) {
        artistPages += 1;
        if (artistPages === 2 && !interrupted) {
          interrupted = true;
          throw new Error('interrupción PostgreSQL simulada');
        }
      }
      return queryRunner.query(sql, parameters);
    };

    await expect(
      runMusicSearchKeyBackfill(query, testSchema, {
        mode: 'apply',
        batchSize: 1,
      }),
    ).rejects.toThrow('artist, lote 2');

    const resumed = await runMusicSearchKeyBackfill(
      (sql, parameters) => queryRunner.query(sql, parameters),
      testSchema,
      { mode: 'apply', batchSize: 1 },
    );
    expect(resumed.artist.updated).toBe(1);
    const verified = await runMusicSearchKeyBackfill(
      (sql, parameters) => queryRunner.query(sql, parameters),
      testSchema,
      { mode: 'verify', batchSize: 1 },
    );
    expect(verified.artist.missing).toBe(0);
    expect(verified.artist.inconsistent).toBe(0);
  });
});
