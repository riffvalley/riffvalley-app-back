import { DataSource, MigrationInterface } from 'typeorm';
import { MigrateCanonicalUserRoles1791910000000 } from './1791910000000-MigrateCanonicalUserRoles';
import { MigrateUsersToSingleRole1791920000000 } from './1791920000000-MigrateUsersToSingleRole';

const databaseUrl = process.env.ROLE_MIGRATION_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const historicalMigration = MigrateCanonicalUserRoles1791910000000;
const singularMigration = MigrateUsersToSingleRole1791920000000;
const migrationClasses = [historicalMigration, singularMigration];
const historicalSnapshot = 'user_roles_migration_snapshot_1791910000000';
const singleRoleSnapshot = 'user_roles_single_snapshot_1791920000000';
const schemaSnapshot = 'user_roles_single_schema_snapshot_1791920000000';

function createDataSource(migrations: Array<new () => MigrationInterface>) {
  if (!databaseUrl) throw new Error('ROLE_MIGRATION_TEST_URL is required');

  const url = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.pathname !== '/role_migration_test'
  ) {
    throw new Error(
      'ROLE_MIGRATION_TEST_URL must point to the local role_migration_test database',
    );
  }

  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [],
    migrations,
    migrationsTableName: 'migrations',
    migrationsTransactionMode: 'each',
    logging: false,
  });
}

async function prepareUsers(dataSource: DataSource): Promise<void> {
  await dataSource.query(`DROP TABLE IF EXISTS "${schemaSnapshot}" CASCADE`);
  await dataSource.query(
    `DROP TABLE IF EXISTS "${singleRoleSnapshot}" CASCADE`,
  );
  await dataSource.query(
    `DROP TABLE IF EXISTS "${historicalSnapshot}" CASCADE`,
  );
  await dataSource.query('DROP TABLE IF EXISTS "migrations" CASCADE');
  await dataSource.query('DROP TABLE IF EXISTS "users" CASCADE');
  await dataSource.query(
    'CREATE TABLE "migrations" ("id" serial PRIMARY KEY, "timestamp" bigint NOT NULL, "name" varchar NOT NULL)',
  );
  await dataSource.query(
    `CREATE TABLE "users" (
      "id" uuid PRIMARY KEY,
      "roles" text[] NOT NULL DEFAULT '{user}'::text[],
      "username" text NOT NULL,
      "email" text NOT NULL,
      "isActive" boolean NOT NULL DEFAULT true
    )`,
  );
  await dataSource.query(
    'CREATE INDEX "users_roles_gin_idx" ON "users" USING gin ("roles")',
  );
  await dataSource.query(
    `COMMENT ON COLUMN "users"."roles" IS 'historical role array'`,
  );
}

async function insertUser(
  dataSource: DataSource,
  id: string,
  roles: string[] | null,
): Promise<void> {
  await dataSource.query(
    'INSERT INTO "users" ("id", "roles", "username", "email", "isActive") VALUES ($1, $2::text[], $3, $4, $5)',
    [id, roles, `username-${id}`, `${id}@example.test`, id.endsWith('1')],
  );
}

async function applyHistoricalFixture(
  dataSource: DataSource,
  users: Array<{ id: string; originalRoles: string[] }>,
): Promise<void> {
  await dataSource.query(
    `CREATE TABLE "${historicalSnapshot}" ("user_id" uuid PRIMARY KEY, "original_roles" text[] NOT NULL, "migrated_roles" text[] NOT NULL)`,
  );

  for (const { id, originalRoles } of users) {
    const migratedRoles = originalRoles
      .filter((role) => role !== 'admin' && role !== 'user')
      .map(
        (role) =>
          ({
            babyUser: 'user',
            riffValley: 'riffvalley',
            superUser: 'superadmin',
          })[role] ?? role,
      );

    await dataSource.query(
      'UPDATE "users" SET "roles" = $1::text[] WHERE "id" = $2',
      [migratedRoles, id],
    );
    if (JSON.stringify(migratedRoles) !== JSON.stringify(originalRoles)) {
      await dataSource.query(
        `INSERT INTO "${historicalSnapshot}" ("user_id", "original_roles", "migrated_roles") VALUES ($1, $2::text[], $3::text[])`,
        [id, originalRoles, migratedRoles],
      );
    }
  }
}

async function readUsers(dataSource: DataSource) {
  return dataSource.query(
    'SELECT "id"::text AS "id", "role", "username", "email", "isActive" FROM "users" ORDER BY "id"',
  );
}

async function readLegacyUsers(dataSource: DataSource) {
  return dataSource.query(
    'SELECT "id"::text AS "id", "roles", "username", "email", "isActive" FROM "users" ORDER BY "id"',
  );
}

describePostgres('MigrateUsersToSingleRole1791920000000 PostgreSQL', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = createDataSource(migrationClasses);
    await dataSource.initialize();
    await prepareUsers(dataSource);
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('uses the historical snapshot to establish babyUser provenance after that migration is recorded', async () => {
    await insertUser(dataSource, '00000000-0000-0000-0000-000000000001', [
      'babyUser',
    ]);
    await applyHistoricalFixture(dataSource, [
      {
        id: '00000000-0000-0000-0000-000000000001',
        originalRoles: ['babyUser'],
      },
    ]);
    await dataSource.query(
      'INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)',
      ['1791910000000', 'MigrateCanonicalUserRoles1791910000000'],
    );

    await dataSource.destroy();
    dataSource = createDataSource([singularMigration]);
    await dataSource.initialize();
    const executed = await dataSource.runMigrations({ transaction: 'each' });

    expect(executed.map(({ name }) => name)).toEqual([
      'MigrateUsersToSingleRole1791920000000',
    ]);
    expect((await readUsers(dataSource)).map(({ role }) => role)).toEqual([
      'user',
    ]);
  });

  it('requires transaction each when the historical migration is pending under TypeORM 0.3.26', async () => {
    await insertUser(dataSource, '00000000-0000-0000-0000-000000000001', [
      'babyUser',
    ]);

    await expect(
      dataSource.runMigrations({ transaction: 'all' }),
    ).rejects.toThrow('transaction mode');
    expect((await readLegacyUsers(dataSource))[0].roles).toEqual(['babyUser']);
  });

  it.each([
    ['admin aislado', ['admin']],
    ['antiguo user aislado', ['user']],
    ['valor desconocido', ['babyUser', 'mystery']],
    ['array vacío', []],
    ['rol duplicado', ['riffValley', 'riffValley']],
    ['colisión de normalización', ['riffValley', 'riffvalley']],
    ['admin sin destino superviviente', ['admin', 'user']],
  ])(
    'aborts atomically for %s before changing the schema',
    async (_label, roles) => {
      await insertUser(
        dataSource,
        '00000000-0000-0000-0000-000000000001',
        roles as string[],
      );
      await insertUser(dataSource, '00000000-0000-0000-0000-000000000002', [
        'babyUser',
      ]);

      const newMigrationDataSource = createDataSource([singularMigration]);
      await newMigrationDataSource.initialize();
      try {
        await expect(
          newMigrationDataSource.runMigrations({ transaction: 'each' }),
        ).rejects.toThrow('Migración de rol único cancelada');
      } finally {
        await newMigrationDataSource.destroy();
      }

      const users = await readLegacyUsers(dataSource);
      expect(users.map(({ roles, role }) => [roles, role])).toEqual([
        [roles, undefined],
        [['babyUser'], undefined],
      ]);
      const columns = await dataSource.query(
        `SELECT "column_name" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('roles', 'role') ORDER BY column_name`,
      );
      expect(columns).toEqual([{ column_name: 'roles' }]);
      expect(
        await dataSource.query(
          `SELECT to_regclass('${singleRoleSnapshot}') AS table`,
        ),
      ).toEqual([{ table: null }]);
    },
  );

  it('rejects NULL arrays and preserves the preexisting nullable schema on failure', async () => {
    await dataSource.query(
      'ALTER TABLE "users" ALTER COLUMN "roles" DROP NOT NULL',
    );
    await insertUser(dataSource, '00000000-0000-0000-0000-000000000001', null);

    const newMigrationDataSource = createDataSource([singularMigration]);
    await newMigrationDataSource.initialize();
    try {
      await expect(
        newMigrationDataSource.runMigrations({ transaction: 'each' }),
      ).rejects.toThrow('roles es NULL');
    } finally {
      await newMigrationDataSource.destroy();
    }

    const columns = await dataSource.query(
      `SELECT "column_name", "is_nullable" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'roles'`,
    );
    expect(columns).toEqual([{ column_name: 'roles', is_nullable: 'YES' }]);
    expect((await readLegacyUsers(dataSource))[0].roles).toBeNull();
  });

  it('aborts the full preflight when one row contains a NULL array member', async () => {
    await insertUser(dataSource, '00000000-0000-0000-0000-000000000001', [
      'babyUser',
      null,
    ] as any);

    const newMigrationDataSource = createDataSource([singularMigration]);
    await newMigrationDataSource.initialize();
    try {
      await expect(
        newMigrationDataSource.runMigrations({ transaction: 'each' }),
      ).rejects.toThrow('NULL o no textual');
    } finally {
      await newMigrationDataSource.destroy();
    }
    expect((await readLegacyUsers(dataSource))[0].roles).toEqual([
      'babyUser',
      null,
    ]);
  });

  it('rolls back DDL and snapshots when a write fails after migration starts', async () => {
    await insertUser(dataSource, '00000000-0000-0000-0000-000000000001', [
      'babyUser',
    ]);
    await dataSource.query(`
      CREATE FUNCTION reject_role_migration_update() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced migration write failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await dataSource.query(`
      CREATE TRIGGER reject_role_migration_update
      BEFORE UPDATE ON "users"
      FOR EACH ROW EXECUTE FUNCTION reject_role_migration_update()
    `);

    const newMigrationDataSource = createDataSource([singularMigration]);
    await newMigrationDataSource.initialize();
    try {
      await expect(
        newMigrationDataSource.runMigrations({ transaction: 'each' }),
      ).rejects.toThrow('forced migration write failure');
    } finally {
      await newMigrationDataSource.destroy();
      await dataSource.query(
        'DROP TRIGGER reject_role_migration_update ON "users"',
      );
      await dataSource.query('DROP FUNCTION reject_role_migration_update()');
    }

    const columns = await dataSource.query(
      `SELECT "column_name" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('roles', 'role') ORDER BY column_name`,
    );
    expect(columns).toEqual([{ column_name: 'roles' }]);
    expect((await readLegacyUsers(dataSource))[0].roles).toEqual(['babyUser']);
    expect(
      await dataSource.query(
        `SELECT to_regclass('${singleRoleSnapshot}') AS table`,
      ),
    ).toEqual([{ table: null }]);
    expect(
      await dataSource.query(
        `SELECT to_regclass('${schemaSnapshot}') AS table`,
      ),
    ).toEqual([{ table: null }]);
  });

  it('keeps admin from granting a role and selects the highest surviving canonical level', async () => {
    await insertUser(dataSource, '00000000-0000-0000-0000-000000000001', [
      'admin',
      'babyUser',
    ]);
    await insertUser(dataSource, '00000000-0000-0000-0000-000000000002', [
      'user',
      'collaborator',
      'riffValley',
    ]);

    const newMigrationDataSource = createDataSource([singularMigration]);
    await newMigrationDataSource.initialize();
    try {
      await newMigrationDataSource.runMigrations({ transaction: 'each' });
    } finally {
      await newMigrationDataSource.destroy();
    }

    expect((await readUsers(dataSource)).map(({ role }) => role)).toEqual([
      'user',
      'riffvalley',
    ]);
  });

  it('restores the exact pre-migration arrays, default, nullability, and schema on down', async () => {
    const originalRoles = [
      ['babyUser'],
      ['user', 'riffValley'],
      ['user', 'riffValley', 'superUser'],
      ['user', 'superUser', 'riffValley'],
      ['riffValley'],
      ['riffValley', 'user', 'superUser'],
    ];
    for (const [index, roles] of originalRoles.entries()) {
      await insertUser(
        dataSource,
        `00000000-0000-0000-0000-00000000000${index + 1}`,
        roles,
      );
    }

    await applyHistoricalFixture(
      dataSource,
      originalRoles.map((originalRoles, index) => ({
        id: `00000000-0000-0000-0000-00000000000${index + 1}`,
        originalRoles,
      })),
    );
    const newMigrationDataSource = createDataSource([singularMigration]);
    await newMigrationDataSource.initialize();
    await newMigrationDataSource.runMigrations({ transaction: 'each' });
    await newMigrationDataSource.undoLastMigration({ transaction: 'each' });
    await newMigrationDataSource.destroy();

    const restored = await readLegacyUsers(dataSource);
    expect(restored.map(({ roles }) => roles)).toEqual([
      ['user'],
      ['riffvalley'],
      ['riffvalley', 'superadmin'],
      ['superadmin', 'riffvalley'],
      ['riffvalley'],
      ['riffvalley', 'superadmin'],
    ]);
    const columns = await dataSource.query(
      `SELECT "column_name", "data_type", "is_nullable", "column_default" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('roles', 'role') ORDER BY column_name`,
    );
    expect(columns).toEqual([
      {
        column_name: 'roles',
        data_type: 'ARRAY',
        is_nullable: 'NO',
        column_default: "'{user}'::text[]",
      },
    ]);
    expect(
      await dataSource.query(
        `SELECT to_regclass('users_roles_gin_idx') AS index`,
      ),
    ).toEqual([{ index: 'users_roles_gin_idx' }]);
    expect(
      await dataSource.query(
        `SELECT col_description('users'::regclass, attnum) AS comment FROM pg_attribute WHERE attrelid = 'users'::regclass AND attname = 'roles'`,
      ),
    ).toEqual([{ comment: 'historical role array' }]);
    expect(
      await dataSource.query(
        `SELECT to_regclass('${singleRoleSnapshot}') AS table`,
      ),
    ).toEqual([{ table: null }]);
    expect(
      await dataSource.query(
        `SELECT to_regclass('${schemaSnapshot}') AS table`,
      ),
    ).toEqual([{ table: null }]);
  });

  it('refuses rollback after post-migration role writes', async () => {
    await insertUser(dataSource, '00000000-0000-0000-0000-000000000001', [
      'babyUser',
    ]);
    const newMigrationDataSource = createDataSource([singularMigration]);
    await newMigrationDataSource.initialize();
    await newMigrationDataSource.runMigrations({ transaction: 'each' });
    await newMigrationDataSource.destroy();
    await dataSource.query('UPDATE "users" SET "role" = $1 WHERE "id" = $2', [
      'superadmin',
      '00000000-0000-0000-0000-000000000001',
    ]);

    await expect(
      dataSource.undoLastMigration({ transaction: 'each' }),
    ).rejects.toThrow('cambió el rol');
    expect((await readUsers(dataSource))[0].role).toBe('superadmin');
    expect(
      await dataSource.query(`SELECT 1 FROM "${singleRoleSnapshot}"`),
    ).toHaveLength(1);
  });
});
