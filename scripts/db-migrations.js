#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { MigrationExecutor } = require('typeorm');
const ROLE_CHAIN_MIGRATIONS = new Set([
  'MigrateCanonicalUserRoles1791910000000',
  'MigrateUsersToSingleRole1791920000000',
]);

function pendingMigrations(allMigrations, appliedNames) {
  const applied = new Set(appliedNames);
  return allMigrations.filter((migration) => !applied.has(migration.name));
}

function parseConfirmation(value) {
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator < 1 || separator === value.length - 1) return null;
  return {
    database: value.slice(0, separator),
    migrations: value
      .slice(separator + 1)
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  };
}

async function inspectMigrationStatus(
  dataSource,
  executorFactory = (source) => new MigrationExecutor(source),
) {
  const executor = executorFactory(dataSource);
  const allMigrations = await executor.getAllMigrations();
  const queryRunner = dataSource.createQueryRunner();

  try {
    const tableName = executor.migrationsTable;
    const ledgerExists = await queryRunner.hasTable(tableName);
    let appliedNames = [];

    if (ledgerExists) {
      const tablePath = queryRunner.escapePath(tableName);
      const rows = await queryRunner.query(
        `SELECT "name" FROM ${tablePath} ORDER BY "id"`,
      );
      appliedNames = rows.map((row) => row.name);
    }

    return {
      ledgerExists,
      ledgerTable: tableName,
      allMigrations,
      appliedNames,
      pending: pendingMigrations(allMigrations, appliedNames),
    };
  } finally {
    await queryRunner.release();
  }
}

function printStatus(status) {
  console.log(
    `Ledger: ${status.ledgerExists ? status.ledgerTable : `${status.ledgerTable} (no existe)`}`,
  );
  console.log(`Migraciones compiladas: ${status.allMigrations.length}`);
  console.log(`Aplicadas: ${status.appliedNames.length}`);
  console.log(`Pendientes: ${status.pending.length}`);
  for (const migration of status.pending) console.log(`  - ${migration.name}`);
}

function printJsonStatus(dataSource, status) {
  console.log(
    JSON.stringify({
      formatVersion: 1,
      stage: process.env.STAGE || null,
      database: dataSource.options.database,
      ledgerExists: status.ledgerExists,
      ledgerTable: status.ledgerTable,
      compiledMigrations: status.allMigrations.length,
      appliedCount: status.appliedNames.length,
      pending: status.pending.map((migration) => migration.name),
    }),
  );
}

async function run(command, args = process.argv.slice(3)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Uso: yarn db:status [--json] | yarn db:check | yarn db:migrate [--confirm <DB_NAME>:<Migracion1,Migracion2>]',
    );
    return;
  }
  if (!['status', 'check', 'migrate'].includes(command)) {
    throw new Error(
      'Uso: yarn db:status [--json] | yarn db:check | yarn db:migrate [--confirm <base>:<Migracion1,Migracion2>]',
    );
  }
  const jsonStatus = args.includes('--json');
  if (jsonStatus && command !== 'status') {
    throw new Error('--json solo está disponible para db:status.');
  }
  if (args.filter((arg) => arg === '--json').length > 1) {
    throw new Error('--json solo puede indicarse una vez.');
  }

  const compiledDataSourcePath = path.resolve(
    __dirname,
    '../dist/data-source.js',
  );
  const compiledMigrationsPath = path.resolve(__dirname, '../dist/migrations');
  if (!require('node:fs').existsSync(compiledDataSourcePath)) {
    throw new Error(
      'No existe dist/data-source.js. Ejecuta yarn build antes del comando de migraciones.',
    );
  }
  if (!require('node:fs').existsSync(compiledMigrationsPath)) {
    throw new Error(
      'No existe dist/migrations. Ejecuta yarn build antes del comando de migraciones.',
    );
  }

  const { default: dataSource } = require(compiledDataSourcePath);
  const required = ['host', 'database', 'username', 'password'];
  const missing = required.filter((key) => {
    const value = dataSource.options[key];
    return !value || value === 'undefined';
  });
  if (missing.length)
    throw new Error(
      `Faltan variables de conexión para TypeORM: ${missing.join(', ')}`,
    );

  dataSource.setOptions({
    entities: [
      path.join(path.dirname(compiledDataSourcePath), '**/*.entity.js'),
    ],
    migrations: [path.join(compiledMigrationsPath, '*.js')],
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
  });

  let initialized = false;
  try {
    await dataSource.initialize();
    initialized = true;
    let status = await inspectMigrationStatus(dataSource);
    if (command === 'status') {
      if (jsonStatus) printJsonStatus(dataSource, status);
      else printStatus(status);
      return;
    }
    printStatus(status);
    if (command === 'check') {
      if (!status.ledgerExists || status.pending.length) {
        throw new Error(
          'La base no está al día. No se modificó el esquema ni el ledger.',
        );
      }
      console.log('La base no tiene migraciones pendientes.');
      return;
    }

    if (!status.pending.length) {
      console.log('No hay migraciones pendientes; no se ejecutó ninguna.');
      return;
    }

    const pendingRoleChain = status.pending.filter((migration) =>
      ROLE_CHAIN_MIGRATIONS.has(migration.name),
    );
    if (pendingRoleChain.length) {
      throw new Error(
        `La cadena específica de roles sigue pendiente (${pendingRoleChain.map((migration) => migration.name).join(', ')}). Usa únicamente yarn migration:roles tras su preflight; db:migrate no ejecutó cambios.`,
      );
    }

    if (process.env.STAGE === 'prod') {
      const confirmIndex = args.indexOf('--confirm');
      const confirmation =
        confirmIndex >= 0 ? parseConfirmation(args[confirmIndex + 1]) : null;
      const expected = status.pending.map((migration) => migration.name);
      if (
        !confirmation ||
        confirmation.database !== dataSource.options.database ||
        confirmation.migrations.join(',') !== expected.join(',')
      ) {
        throw new Error(
          `Producción bloqueada. Para autorizar únicamente esta lista revisada, repite con --confirm ${dataSource.options.database}:${expected.join(',')}`,
        );
      }
    }

    console.log('Ejecutando migraciones pendientes manualmente…');
    const executed = await dataSource.runMigrations({ transaction: 'all' });
    for (const migration of executed)
      console.log(`Aplicada: ${migration.name}`);

    status = await inspectMigrationStatus(dataSource);
    printStatus(status);
    if (!status.ledgerExists || status.pending.length) {
      throw new Error(
        'La verificación posterior detectó migraciones pendientes o ledger ausente. Detén el procedimiento.',
      );
    }
    console.log(
      'Ledger y migraciones verificadas. Comprueba ahora el esquema, los datos y la API según el runbook.',
    );
  } finally {
    if (initialized) await dataSource.destroy();
  }
}

if (require.main === module) {
  run(process.argv[2]).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  inspectMigrationStatus,
  printJsonStatus,
  parseConfirmation,
  pendingMigrations,
  ROLE_CHAIN_MIGRATIONS,
};
