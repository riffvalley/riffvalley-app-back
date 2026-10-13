import { basename, resolve } from 'node:path';
import { DataSource, MigrationInterface } from 'typeorm';
import {
  configureRolesMigrationDiscovery,
  isTimestampedMigrationFile,
  runRolesMigrationChain,
} from '../../../scripts/run-roles-migration-chain';
import { MigrateCanonicalUserRoles1791910000000 } from '../1791910000000-MigrateCanonicalUserRoles';
import { MigrateUsersToSingleRole1791920000000 } from '../1791920000000-MigrateUsersToSingleRole';

class UnrelatedPendingMigration1791930000000 implements MigrationInterface {
  name = 'UnrelatedPendingMigration1791930000000';

  async up(): Promise<void> {}

  async down(): Promise<void> {}
}

function createRunnerFixture(
  migrations: MigrationInterface[],
  executedNames: string[],
) {
  const connection = new DataSource({ type: 'postgres', migrations: [] });
  Object.assign(connection, { migrations, isInitialized: true });

  const queryRunner = {
    connect: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    hasTable: jest.fn(async (tableName: string) => tableName === 'migrations'),
    query: jest.fn(async () => []),
  };
  jest
    .spyOn(connection, 'createQueryRunner')
    .mockReturnValue(queryRunner as never);

  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () =>
      executedNames.map((name, index) => ({
        id: index + 1,
        timestamp: Number(name.slice(-13)),
        name,
      })),
    ),
  };
  jest
    .spyOn(connection.manager, 'createQueryBuilder')
    .mockReturnValue(queryBuilder as never);
  return { connection, queryRunner, queryBuilder };
}

describe('role migration discovery', () => {
  it('accepts timestamped migration files and rejects specs, tests, and other files', () => {
    expect(isTimestampedMigrationFile('1791920000000-MigrateUsers.ts')).toBe(
      true,
    );
    expect(
      isTimestampedMigrationFile('1791920000000-MigrateUsers.spec.ts'),
    ).toBe(false);
    expect(
      isTimestampedMigrationFile('1791920000000-MigrateUsers.test.ts'),
    ).toBe(false);
    expect(isTimestampedMigrationFile('data-source.ts')).toBe(false);
  });

  it('configures TypeORM with real source migrations only', () => {
    const connection = new DataSource({ type: 'postgres', migrations: [] });

    const migrations = configureRolesMigrationDiscovery(connection, 'dev');
    const names = migrations.map((migration) => basename(migration));

    expect(names).toContain('1791910000000-MigrateCanonicalUserRoles.ts');
    expect(names).toContain('1791920000000-MigrateUsersToSingleRole.ts');
    expect(names.some((name) => /\.(spec|test)\.ts$/.test(name))).toBe(false);
    expect(migrations).toEqual([...migrations].sort());
    expect(connection.options.migrations).toEqual(migrations);
    expect(
      migrations.every((migration) =>
        migration.startsWith(resolve('src/migrations')),
      ),
    ).toBe(true);
  });

  it('rejects unrelated pending migrations before executing any migration', async () => {
    const fixture = createRunnerFixture(
      [
        new MigrateCanonicalUserRoles1791910000000(),
        new MigrateUsersToSingleRole1791920000000(),
        new UnrelatedPendingMigration1791930000000(),
      ],
      [],
    );

    await expect(runRolesMigrationChain(fixture.connection)).rejects.toThrow(
      'hay migraciones ajenas pendientes',
    );
    expect(fixture.queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('rejects a single-role ledger entry without the historical migration', async () => {
    const fixture = createRunnerFixture(
      [
        new MigrateCanonicalUserRoles1791910000000(),
        new MigrateUsersToSingleRole1791920000000(),
      ],
      ['MigrateUsersToSingleRole1791920000000'],
    );

    await expect(runRolesMigrationChain(fixture.connection)).rejects.toThrow(
      'sin la histórica',
    );
    expect(fixture.queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('rejects an applied historical migration without its snapshot', async () => {
    const fixture = createRunnerFixture(
      [
        new MigrateCanonicalUserRoles1791910000000(),
        new MigrateUsersToSingleRole1791920000000(),
      ],
      ['MigrateCanonicalUserRoles1791910000000'],
    );

    await expect(runRolesMigrationChain(fixture.connection)).rejects.toThrow(
      'falta el snapshot histórico',
    );
    expect(fixture.queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
  });
});
