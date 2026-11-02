import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { normalizeGeography } from '../../../geography/helpers/normalize-geography';
import { PrepareTourNamesAndImportReceipts1792120000000 } from '../../../../migrations/1792120000000-PrepareTourNamesAndImportReceipts';
import { ImportRowReceiptsService } from '../import-row-receipts.service';

const enabled = process.env.CON_B04A_PG_INTEGRATION === '1';
const integrationSuite = enabled ? describe : describe.skip;

function assertIsolatedTarget(): void {
  if (
    process.env.STAGE === 'prod' ||
    !['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST ?? '') ||
    !process.env.DB_NAME?.startsWith('con_b04a_') ||
    !process.env.DB_USERNAME ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      'CON-B04a PostgreSQL integration requires an isolated loopback database named with the con_b04a_ prefix.',
    );
  }
}

integrationSuite('Import row receipts PostgreSQL integration', () => {
  let dataSource: DataSource;
  let service: ImportRowReceiptsService;
  let migration: PrepareTourNamesAndImportReceipts1792120000000;
  let editorId: string;

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
    if (existingTables[0]?.count !== 0)
      throw new Error('CON-B04a PostgreSQL test database must be empty.');

    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await dataSource.query('CREATE TABLE "users" ("id" uuid PRIMARY KEY)');
    await dataSource.query(`
      CREATE TABLE "tours" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(180) NOT NULL,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query('INSERT INTO "tours" ("name") VALUES ($1)', [
      'Legacy Tour',
    ]);
    migration = new PrepareTourNamesAndImportReceipts1792120000000();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration.up(queryRunner);
    } finally {
      await queryRunner.release();
    }
    const backfilledTours = await dataSource.query(
      'SELECT "normalized_name" FROM "tours"',
    );
    expect(backfilledTours).toEqual([{ normalized_name: 'legacy tour' }]);
    editorId = randomUUID();
    await dataSource.query('INSERT INTO "users" ("id") VALUES ($1)', [
      editorId,
    ]);
    service = new ImportRowReceiptsService(dataSource);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DROP TABLE "catalog_import_row_receipts"');
    await dataSource.query('DROP TABLE "tours"');
    await dataSource.query('DROP TABLE "users"');
    await dataSource.query('DROP EXTENSION "uuid-ossp"');
    await dataSource.destroy();
  });

  it('serializes concurrent identical retries into one persisted operation', async () => {
    const identity = { editorId, batchId: randomUUID(), rowId: randomUUID() };
    let workCount = 0;
    const operation = async () => {
      workCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { eventId: 'event-1' };
    };

    const results = await Promise.all([
      service.execute(identity, { name: 'Tour', venue: 'Sala' }, operation),
      service.execute(identity, { venue: 'Sala', name: 'Tour' }, operation),
    ]);
    expect(workCount).toBe(1);
    expect(results.map((result) => result.replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(results.map((result) => result.result)).toEqual([
      { eventId: 'event-1' },
      { eventId: 'event-1' },
    ]);

    const receipts = await dataSource.query(
      'SELECT "id" FROM "catalog_import_row_receipts" WHERE "editor_id" = $1',
      [editorId],
    );
    expect(receipts).toHaveLength(1);
  });

  it('uses PostgreSQL identity uniqueness and permits the same row key for another editor', async () => {
    const sharedIds = { batchId: randomUUID(), rowId: randomUUID() };
    await service.execute(
      { editorId, ...sharedIds },
      { name: 'Tour' },
      async () => ({ eventId: 'event-1' }),
    );
    const secondEditorId = randomUUID();
    await dataSource.query('INSERT INTO "users" ("id") VALUES ($1)', [
      secondEditorId,
    ]);
    await service.execute(
      { editorId: secondEditorId, ...sharedIds },
      { name: 'Tour' },
      async () => ({ eventId: 'event-2' }),
    );
    const receipts = await dataSource.query(
      'SELECT "editor_id" FROM "catalog_import_row_receipts" WHERE "batch_id" = $1 AND "row_id" = $2',
      [sharedIds.batchId, sharedIds.rowId],
    );
    expect(receipts).toHaveLength(2);
  });

  it('enforces normalized Tour name uniqueness in PostgreSQL', async () => {
    const name = 'Septicflesh European Tour 2027';
    await dataSource.query(
      'INSERT INTO "tours" ("name", "normalized_name") VALUES ($1, $2)',
      [name, normalizeGeography(name)],
    );
    await expect(
      dataSource.query(
        'INSERT INTO "tours" ("name", "normalized_name") VALUES ($1, $2)',
        [
          'SEPTICFLESH   European Tour 2027',
          normalizeGeography('SEPTICFLESH   European Tour 2027'),
        ],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'UQ_tours_normalized_name',
    });
  });

  it('rolls back the receipt when the transactional import operation fails', async () => {
    const identity = { editorId, batchId: randomUUID(), rowId: randomUUID() };
    await expect(
      service.execute(identity, { name: 'Tour' }, async () => {
        await dataSource.manager.query(
          'INSERT INTO "tours" ("name", "normalized_name") VALUES ($1, $2)',
          ['Transient Tour', 'transient tour'],
        );
        throw new Error('event persistence failed');
      }),
    ).rejects.toThrow('event persistence failed');

    const receipts = await dataSource.query(
      'SELECT "id" FROM "catalog_import_row_receipts" WHERE "editor_id" = $1 AND "batch_id" = $2 AND "row_id" = $3',
      [identity.editorId, identity.batchId, identity.rowId],
    );
    const tours = await dataSource.query(
      'SELECT "id" FROM "tours" WHERE "normalized_name" = $1',
      ['transient tour'],
    );
    expect(receipts).toHaveLength(0);
    expect(tours).toHaveLength(0);
  });
});
