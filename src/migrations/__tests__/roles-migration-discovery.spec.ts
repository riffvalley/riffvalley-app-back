import { basename, resolve } from 'node:path';
import { DataSource } from 'typeorm';
import {
  configureRolesMigrationDiscovery,
  isTimestampedMigrationFile,
} from '../../../scripts/run-roles-migration-chain';

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
});
