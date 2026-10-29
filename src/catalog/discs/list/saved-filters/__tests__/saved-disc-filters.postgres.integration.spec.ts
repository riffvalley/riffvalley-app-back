import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreateSavedDiscFilters1792030000000 } from 'src/migrations/1792030000000-CreateSavedDiscFilters';
import {
  CreateSavedDiscFilterDto,
  SavedDiscFilterCriteriaDto,
} from '../dto/saved-disc-filter.dto';
import { SavedDiscFilter } from '../entities/saved-disc-filter.entity';
import { SavedDiscFiltersService } from '../saved-disc-filters.service';

const describePostgres =
  process.env.CAT_DISC_6B_POSTGRES_TEST === '1' ? describe : describe.skip;
const POSTGRES_TEST_TARGET = {
  host: '127.0.0.1',
  port: 55434,
  database: 'cat_disc_6b_test',
  username: 'postgres',
} as const;
const USER_ID = '00000000-0000-4000-8000-000000000001';

function requireIsolatedTestTarget(): void {
  if (
    process.env.STAGE !== 'dev' ||
    process.env.DB_HOST !== POSTGRES_TEST_TARGET.host ||
    Number(process.env.DB_PORT) !== POSTGRES_TEST_TARGET.port ||
    process.env.DB_NAME !== POSTGRES_TEST_TARGET.database ||
    process.env.DB_USERNAME !== POSTGRES_TEST_TARGET.username ||
    process.env.DB_PASSWORD !== 'cat_disc_test_only' ||
    process.env.DATABASE_URL
  ) {
    throw new Error(
      'CAT-DISC-6b requiere exclusivamente su PostgreSQL efímero local.',
    );
  }
}

describePostgres('Saved DiscList filters PostgreSQL integration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    requireIsolatedTestTarget();
    dataSource = new DataSource({
      type: 'postgres',
      host: POSTGRES_TEST_TARGET.host,
      port: POSTGRES_TEST_TARGET.port,
      database: POSTGRES_TEST_TARGET.database,
      username: POSTGRES_TEST_TARGET.username,
      password: process.env.DB_PASSWORD,
      entities: [SavedDiscFilter],
      synchronize: false,
      migrationsRun: false,
    });
    await dataSource.initialize();
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await dataSource.query('CREATE TABLE "users" ("id" uuid PRIMARY KEY)');
    const migrationRunner = dataSource.createQueryRunner();
    await new CreateSavedDiscFilters1792030000000().up(migrationRunner);
    await migrationRunner.release();
    await dataSource.query('INSERT INTO "users" ("id") VALUES ($1)', [USER_ID]);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    const migrationRunner = dataSource.createQueryRunner();
    await new CreateSavedDiscFilters1792030000000().down(migrationRunner);
    await migrationRunner.release();
    await dataSource.query('DROP TABLE "users"');
    await dataSource.destroy();
  });

  it('runs the PostgreSQL migration, round-trips JSONB, and serializes concurrent limit checks', async () => {
    const service = new SavedDiscFiltersService(
      dataSource,
      dataSource.getRepository(SavedDiscFilter),
      { find: async () => [] },
      { find: async () => [] },
    );
    const createDto = (name: string): CreateSavedDiscFilterDto =>
      Object.assign(new CreateSavedDiscFilterDto(), {
        name,
        filters: Object.assign(new SavedDiscFilterCriteriaDto(), {
          genreIds: [],
          countryId: null,
          yearFrom: 1990,
          yearTo: 2026,
        }),
      });

    const created = await service.create(USER_ID, createDto('JSONB y año'));
    const persisted = await dataSource.query(
      'SELECT "filters" FROM "saved_disc_filters" WHERE "id" = $1',
      [created.id],
    );
    expect(persisted[0].filters).toEqual({
      genreIds: [],
      countryId: null,
      yearFrom: 1990,
      yearTo: 2026,
    });
    const indexes = await dataSource.query(
      'SELECT indexdef FROM pg_indexes WHERE indexname = $1',
      ['IDX_saved_disc_filters_user_id_created_at'],
    );
    const foreignKeys = await dataSource.query(
      'SELECT confdeltype FROM pg_constraint WHERE conname = $1',
      ['FK_saved_disc_filters_user'],
    );
    expect(indexes[0].indexdef).toMatch(/user_id.*created_at.*id/);
    expect(foreignKeys[0].confdeltype).toBe('c');

    const pendingCreates = Array.from({ length: 20 }, (_, index) =>
      service.create(USER_ID, createDto(`Filtro ${index + 1}`)),
    );
    const results = await Promise.allSettled(pendingCreates);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(19);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      dataSource
        .getRepository(SavedDiscFilter)
        .count({ where: { userId: USER_ID } }),
    ).resolves.toBe(20);

    await dataSource.query('DELETE FROM "users" WHERE "id" = $1', [USER_ID]);
    await expect(
      dataSource.getRepository(SavedDiscFilter).count(),
    ).resolves.toBe(0);
  });
});
