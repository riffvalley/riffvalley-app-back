import { QueryRunner } from 'typeorm';
import { MigrateCanonicalUserRoles1791910000000 } from './1791910000000-MigrateCanonicalUserRoles';

type TestUser = {
  id: string;
  roles: string[] | null;
  email: string;
  isActive: boolean;
};

type TestSnapshot = {
  user_id: string;
  original_roles: string[];
  migrated_roles: string[];
};

function createQueryRunner(initialUsers: TestUser[]) {
  const users = initialUsers.map((user) => ({
    ...user,
    roles: user.roles && [...user.roles],
  }));
  const snapshots: TestSnapshot[] = [];
  let snapshotTableExists = false;
  let userSelectCount = 0;

  const runner = {
    hasTable: jest.fn(async () => snapshotTableExists),
    query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.startsWith('LOCK TABLE')) return [];

      if (sql.startsWith('SELECT "id", "roles" FROM "users" WHERE')) {
        const ids = parameters[0] as string[];
        return users
          .filter((user) => ids.includes(user.id))
          .map(({ id, roles }) => ({ id, roles: roles && [...roles] }));
      }

      if (sql.startsWith('SELECT "id", "roles" FROM "users"')) {
        userSelectCount += 1;
        if (userSelectCount === 2 && runner.afterMigrationRows) {
          return runner.afterMigrationRows(users);
        }
        return users.map(({ id, roles }) => ({
          id,
          roles: roles && [...roles],
        }));
      }

      if (sql.startsWith('CREATE TABLE')) {
        snapshotTableExists = true;
        return [];
      }

      if (
        sql.startsWith(
          'INSERT INTO "user_roles_migration_snapshot_1791910000000"',
        )
      ) {
        const [user_id, original_roles, migrated_roles] = parameters as [
          string,
          string[],
          string[],
        ];
        snapshots.push({
          user_id,
          original_roles: [...original_roles],
          migrated_roles: [...migrated_roles],
        });
        return { rowCount: 1 };
      }

      if (sql.startsWith('UPDATE "users" SET "roles"')) {
        const [roles, id] = parameters as [string[], string];
        const user = users.find((candidate) => candidate.id === id);
        if (!user) return { rowCount: 0 };
        user.roles = [...roles];
        return { rowCount: 1 };
      }

      if (sql.startsWith('SELECT "user_id", "original_roles"')) {
        return snapshots.map((snapshot) => ({
          ...snapshot,
          original_roles: [...snapshot.original_roles],
          migrated_roles: [...snapshot.migrated_roles],
        }));
      }

      if (sql.startsWith('DROP TABLE')) {
        snapshotTableExists = false;
        return [];
      }

      throw new Error(`Unexpected migration SQL: ${sql}`);
    }),
    afterMigrationRows: undefined as
      | ((currentUsers: TestUser[]) => TestUser[])
      | undefined,
  };

  return {
    runner: runner as unknown as QueryRunner,
    users,
    snapshots,
    runnerState: runner,
  };
}

describe('MigrateCanonicalUserRoles1791910000000', () => {
  const migration = new MigrateCanonicalUserRoles1791910000000();

  it.each([
    { before: ['babyUser'], after: ['user'] },
    { before: ['user', 'riffValley'], after: ['riffvalley'] },
    {
      before: ['user', 'riffValley', 'superUser'],
      after: ['riffvalley', 'superadmin'],
    },
    {
      before: ['user', 'superUser', 'riffValley'],
      after: ['superadmin', 'riffvalley'],
    },
    { before: ['riffValley'], after: ['riffvalley'] },
    {
      before: ['riffValley', 'user', 'superUser'],
      after: ['riffvalley', 'superadmin'],
    },
  ])(
    'maps the observed local array $before in order',
    async ({ before, after }) => {
      const { runner, users, snapshots } = createQueryRunner([
        { id: 'user-1', roles: before, email: 'unchanged', isActive: true },
      ]);

      await migration.up(runner);

      expect(users).toEqual([
        { id: 'user-1', roles: after, email: 'unchanged', isActive: true },
      ]);
      expect(snapshots).toEqual([
        { user_id: 'user-1', original_roles: before, migrated_roles: after },
      ]);
      expect(migration.transaction).toBe(true);
    },
  );

  it('preserves existing canonical collaborator and privileged roles without assigning collaborator', async () => {
    const { runner, users } = createQueryRunner([
      {
        id: 'user-1',
        roles: ['collaborator', 'riffvalley', 'superadmin'],
        email: 'unchanged',
        isActive: true,
      },
      {
        id: 'user-2',
        roles: ['babyUser'],
        email: 'unchanged-too',
        isActive: true,
      },
    ]);

    await migration.up(runner);

    expect(users.map(({ roles }) => roles)).toEqual([
      ['collaborator', 'riffvalley', 'superadmin'],
      ['user'],
    ]);
  });

  it('keeps the user role created from babyUser while removing the old user entry', async () => {
    const { runner, users } = createQueryRunner([
      {
        id: 'user-1',
        roles: ['babyUser', 'user', 'riffValley'],
        email: 'unchanged',
        isActive: true,
      },
    ]);

    await migration.up(runner);

    expect(users[0].roles).toEqual(['user', 'riffvalley']);
  });

  it.each([
    { description: 'unknown values', roles: ['babyUser', 'mystery'] },
    { description: 'empty arrays', roles: [] },
    { description: 'admin without a survivor', roles: ['admin'] },
    { description: 'isolated old user', roles: ['user'] },
    {
      description: 'old user mixed with canonical roles',
      roles: ['user', 'superadmin'],
    },
    {
      description: 'duplicate input values',
      roles: ['riffValley', 'riffValley'],
    },
    {
      description: 'colliding legacy and canonical values',
      roles: ['superUser', 'superadmin'],
    },
    {
      description: 'old user without a privileged survivor',
      roles: ['user', 'collaborator'],
    },
  ])('aborts before writes for $description', async ({ roles }) => {
    const { runner, users } = createQueryRunner([
      { id: 'user-1', roles, email: 'unchanged', isActive: true },
    ]);

    await expect(migration.up(runner)).rejects.toThrow(
      'Migración de roles cancelada',
    );
    expect(users[0].roles).toEqual(roles);
    expect(
      (runner.query as jest.Mock).mock.calls.some(([sql]) =>
        /^(CREATE TABLE|INSERT INTO|UPDATE "users")/.test(sql),
      ),
    ).toBe(false);
  });

  it('aborts on NULL roles before any record write', async () => {
    const { runner, users } = createQueryRunner([
      { id: 'user-1', roles: null, email: 'unchanged', isActive: true },
    ]);

    await expect(migration.up(runner)).rejects.toThrow('roles es NULL');
    expect(users[0].roles).toBeNull();
  });

  it('prevalidates every account before changing an otherwise valid first row', async () => {
    const { runner, users } = createQueryRunner([
      { id: 'user-1', roles: ['babyUser'], email: 'first', isActive: true },
      {
        id: 'user-2',
        roles: ['unknown-role'],
        email: 'second',
        isActive: true,
      },
    ]);

    await expect(migration.up(runner)).rejects.toThrow('rol desconocido');
    expect(users.map(({ roles }) => roles)).toEqual([
      ['babyUser'],
      ['unknown-role'],
    ]);
    expect(
      (runner.query as jest.Mock).mock.calls.some(([sql]) =>
        /^(CREATE TABLE|INSERT INTO|UPDATE "users")/.test(sql),
      ),
    ).toBe(false);
  });

  it('keeps the account set and non-role columns unchanged', async () => {
    const { runner, users } = createQueryRunner([
      { id: 'user-1', roles: ['babyUser'], email: 'first', isActive: true },
      { id: 'user-2', roles: ['riffValley'], email: 'second', isActive: false },
    ]);

    await migration.up(runner);

    expect(users).toEqual([
      { id: 'user-1', roles: ['user'], email: 'first', isActive: true },
      { id: 'user-2', roles: ['riffvalley'], email: 'second', isActive: false },
    ]);
    expect(
      (runner.query as jest.Mock).mock.calls
        .map(([sql]) => sql as string)
        .filter((sql) => sql.startsWith('UPDATE "users"'))
        .every(
          (sql) =>
            sql === 'UPDATE "users" SET "roles" = $1::text[] WHERE "id" = $2',
        ),
    ).toBe(true);
  });

  it('removes admin only when another valid role survives', async () => {
    const { runner, users } = createQueryRunner([
      {
        id: 'user-1',
        roles: ['admin', 'superUser'],
        email: 'unchanged',
        isActive: true,
      },
    ]);

    await migration.up(runner);

    expect(users[0].roles).toEqual(['superadmin']);
  });

  it('restores the exact original arrays from the snapshot in down', async () => {
    const { runner, users, runnerState } = createQueryRunner([
      {
        id: 'user-1',
        roles: ['user', 'superUser', 'riffValley'],
        email: 'first',
        isActive: true,
      },
      { id: 'user-2', roles: ['babyUser'], email: 'second', isActive: false },
    ]);

    await migration.up(runner);
    await migration.down(runner);

    expect(users.map(({ roles }) => roles)).toEqual([
      ['user', 'superUser', 'riffValley'],
      ['babyUser'],
    ]);
    expect(runnerState.hasTable).toHaveBeenCalledTimes(2);
    expect((runner.query as jest.Mock).mock.calls.at(-1)?.[0]).toBe(
      'DROP TABLE "user_roles_migration_snapshot_1791910000000"',
    );
  });

  it('refuses rollback when a role array changed after migration', async () => {
    const { runner, users, runnerState } = createQueryRunner([
      { id: 'user-1', roles: ['babyUser'], email: 'unchanged', isActive: true },
    ]);

    await migration.up(runner);
    users[0].roles = ['user', 'superadmin'];

    await expect(migration.down(runner)).rejects.toThrow('cambiaron los roles');
    expect(users[0].roles).toEqual(['user', 'superadmin']);
    expect(
      (runner.query as jest.Mock).mock.calls.some(([sql]) =>
        String(sql).startsWith('DROP TABLE'),
      ),
    ).toBe(false);
    expect(runnerState.hasTable).toHaveBeenCalledTimes(2);
  });

  it('aborts if post-migration verification detects a changed account set', async () => {
    const { runner, runnerState } = createQueryRunner([
      { id: 'user-1', roles: ['babyUser'], email: 'unchanged', isActive: true },
    ]);
    runnerState.afterMigrationRows = (currentUsers) => [
      ...currentUsers.map((user) => ({
        ...user,
        roles: user.roles && [...user.roles],
      })),
      { id: 'unexpected', roles: ['user'], email: '', isActive: true },
    ];

    await expect(migration.up(runner)).rejects.toThrow(
      'cambió el número de cuentas',
    );
    expect(migration.transaction).toBe(true);
  });
});
