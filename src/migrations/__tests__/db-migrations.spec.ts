const {
  inspectMigrationStatus,
  printJsonStatus,
  parseConfirmation,
  pendingMigrations,
  ROLE_CHAIN_MIGRATIONS,
} = require('../../../scripts/db-migrations');

describe('manual migration commands', () => {
  it('emits stable JSON with the datasource database and ordered pending names', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    printJsonStatus(
      { options: { database: 'riffvalley_test' } },
      {
        ledgerExists: true,
        ledgerTable: 'migrations',
        allMigrations: [
          { name: 'First1700000000000' },
          { name: 'Second1700000000001' },
        ],
        appliedNames: ['First1700000000000'],
        pending: [{ name: 'Second1700000000001' }],
      },
    );

    expect(JSON.parse(log.mock.calls[0][0])).toEqual({
      formatVersion: 1,
      stage: null,
      database: 'riffvalley_test',
      ledgerExists: true,
      ledgerTable: 'migrations',
      compiledMigrations: 2,
      appliedCount: 1,
      pending: ['Second1700000000001'],
    });
    log.mockRestore();
  });

  it('marks every compiled migration pending when the ledger does not exist without creating it', async () => {
    const calls: string[] = [];
    const dataSource = {
      createQueryRunner: () => ({
        hasTable: async () => {
          calls.push('hasTable');
          return false;
        },
        query: async () => {
          calls.push('query');
          return [];
        },
        release: async () => calls.push('release'),
      }),
    };
    const migrations = [
      { name: 'First1700000000000' },
      { name: 'Second1700000000001' },
    ];
    const result = await inspectMigrationStatus(dataSource, () => ({
      migrationsTable: 'migrations',
      getAllMigrations: async () => migrations,
    }));

    expect(result.ledgerExists).toBe(false);
    expect(result.pending).toEqual(migrations);
    expect(calls).toEqual(['hasTable', 'release']);
  });

  it('reads applied names and preserves TypeORM migration order', async () => {
    const calls: string[] = [];
    const migrations = [
      { name: 'First1700000000000' },
      { name: 'Second1700000000001' },
    ];
    const result = await inspectMigrationStatus(
      {
        createQueryRunner: () => ({
          hasTable: async () => true,
          escapePath: (table: string) => `"${table}"`,
          query: async (sql: string) => {
            calls.push(sql);
            return [{ name: 'First1700000000000' }];
          },
          release: async () => undefined,
        }),
      },
      () => ({
        migrationsTable: 'migrations',
        getAllMigrations: async () => migrations,
      }),
    );

    expect(calls).toEqual(['SELECT "name" FROM "migrations" ORDER BY "id"']);
    expect(result.appliedNames).toEqual(['First1700000000000']);
    expect(result.pending).toEqual([migrations[1]]);
  });

  it('parses an explicit database and ordered migration confirmation', () => {
    expect(
      parseConfirmation('riffvalley:First1700000000000,Second1700000000001'),
    ).toEqual({
      database: 'riffvalley',
      migrations: ['First1700000000000', 'Second1700000000001'],
    });
    expect(parseConfirmation('invalid')).toBeNull();
    expect(pendingMigrations([{ name: 'a' }, { name: 'b' }], ['a'])).toEqual([
      { name: 'b' },
    ]);
    expect(
      ROLE_CHAIN_MIGRATIONS.has('MigrateUsersToSingleRole1791920000000'),
    ).toBe(true);
  });
});
