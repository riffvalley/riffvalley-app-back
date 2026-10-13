import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, MigrationExecutor, QueryRunner } from 'typeorm';
import dataSource from '../src/data-source';

const HISTORICAL_MIGRATION = 'MigrateCanonicalUserRoles1791910000000';
const SINGLE_ROLE_MIGRATION = 'MigrateUsersToSingleRole1791920000000';
const HISTORICAL_SNAPSHOT = 'user_roles_migration_snapshot_1791910000000';
const SINGLE_ROLE_SNAPSHOT = 'user_roles_single_snapshot_1791920000000';
const SCHEMA_SNAPSHOT = 'user_roles_single_schema_snapshot_1791920000000';
const LEGACY_ROLE_UPDATE =
  'UPDATE "users" SET "roles" = $1::text[] WHERE "id" = $2';
const MIGRATION_FILENAME = /^\d{13}-[A-Za-z0-9_-]+\.(?:ts|js)$/;

export function isTimestampedMigrationFile(fileName: string): boolean {
  return MIGRATION_FILENAME.test(fileName);
}

/**
 * Restrict this runner to timestamped migration files. The datasource's
 * general `*.ts` glob also matches Jest specs kept beside the migrations.
 */
export function configureRolesMigrationDiscovery(
  connection: DataSource,
  stage = process.env.STAGE,
): string[] {
  const isProd = stage === 'prod';
  const extension = isProd ? '.js' : '.ts';
  const directory = resolve(isProd ? 'dist/migrations' : 'src/migrations');
  const migrations = readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(extension) &&
        isTimestampedMigrationFile(entry.name),
    )
    .map((entry) => resolve(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));

  if (migrations.length === 0) {
    throw new Error(
      `Runner de migración de roles: no se encontraron migraciones en ${directory}`,
    );
  }

  connection.setOptions({ migrations });
  return migrations;
}

type CompatibleQuery = (
  query: string,
  parameters?: unknown[],
  useStructuredResult?: boolean,
) => Promise<unknown>;

function affectedRows(result: unknown): number | undefined {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    typeof result[1] === 'number'
  ) {
    return result[1];
  }

  if (result && typeof result === 'object') {
    if ('rowCount' in result && typeof result.rowCount === 'number') {
      return result.rowCount;
    }
    if ('affected' in result && typeof result.affected === 'number') {
      return result.affected;
    }
  }

  return undefined;
}

/**
 * The historical migration expects `{ rowCount }`, while TypeORM 0.3.26's
 * PostgreSQL QueryRunner returns `[rows, affected]` for UPDATE statements.
 * Adapt only its exact legacy SQL, and only on this one-off migration runner.
 */
function adaptHistoricalQueryResult(queryRunner: QueryRunner): void {
  const originalQuery = queryRunner.query.bind(queryRunner) as CompatibleQuery;

  Object.defineProperty(queryRunner, 'query', {
    configurable: true,
    value: async (
      query: string,
      parameters?: unknown[],
      useStructuredResult?: boolean,
    ): Promise<unknown> => {
      const result = await originalQuery(
        query,
        parameters,
        useStructuredResult,
      );

      if (query.trim() !== LEGACY_ROLE_UPDATE) return result;

      const rowCount = affectedRows(result);
      if (rowCount === undefined) {
        throw new Error(
          'Runner de migración de roles: TypeORM no devolvió un número de filas afectadas reconocible para la migración histórica',
        );
      }

      return { rowCount };
    },
  });
}

/**
 * Runs only the role migration chain, rejecting any unrelated pending
 * migration. The historical migration itself remains unchanged.
 */
export async function runRolesMigrationChain(
  connection: DataSource,
): Promise<string[]> {
  const ownsConnection = !connection.isInitialized;
  if (ownsConnection) await connection.initialize();

  const queryRunner = connection.createQueryRunner();
  try {
    await queryRunner.connect();
    const migrationsTableName =
      connection.options.migrationsTableName ?? 'migrations';
    if (!(await queryRunner.hasTable(migrationsTableName))) {
      throw new Error(
        `Runner de migración de roles: no existe el ledger ${migrationsTableName}; realizar preflight y no inferir el estado histórico`,
      );
    }

    const executor = new MigrationExecutor(connection, queryRunner);
    executor.transaction = 'each';

    const allMigrations = await executor.getAllMigrations();
    const allNames = new Set(allMigrations.map(({ name }) => name));
    for (const required of [HISTORICAL_MIGRATION, SINGLE_ROLE_MIGRATION]) {
      if (!allNames.has(required)) {
        throw new Error(
          `Runner de migración de roles: no está cargada la migración ${required}`,
        );
      }
    }

    const executedMigrations = await executor.getExecutedMigrations();
    const executedNames = new Set(executedMigrations.map(({ name }) => name));
    const pendingMigrations = allMigrations.filter(
      ({ name }) => !executedNames.has(name),
    );
    const roleMigrations = new Set([
      HISTORICAL_MIGRATION,
      SINGLE_ROLE_MIGRATION,
    ]);
    const unrelatedPending = pendingMigrations
      .map(({ name }) => name)
      .filter((name) => !roleMigrations.has(name));

    if (unrelatedPending.length > 0) {
      throw new Error(
        `Runner de migración de roles: hay migraciones ajenas pendientes; ejecutar el procedimiento general revisado: ${unrelatedPending.join(', ')}`,
      );
    }

    if (
      executedNames.has(SINGLE_ROLE_MIGRATION) &&
      !executedNames.has(HISTORICAL_MIGRATION)
    ) {
      throw new Error(
        'Runner de migración de roles: el ledger registra la migración singular sin la histórica; revisar el entorno antes de continuar',
      );
    }

    if (executedNames.has(HISTORICAL_MIGRATION)) {
      if (!(await queryRunner.hasTable(HISTORICAL_SNAPSHOT))) {
        throw new Error(
          `Runner de migración de roles: falta el snapshot histórico ${HISTORICAL_SNAPSHOT}`,
        );
      }
    }

    if (executedNames.has(SINGLE_ROLE_MIGRATION)) {
      if (
        !(await queryRunner.hasTable(SINGLE_ROLE_SNAPSHOT)) ||
        !(await queryRunner.hasTable(SCHEMA_SNAPSHOT))
      ) {
        throw new Error(
          'Runner de migración de roles: faltan snapshots de la migración singular aplicada',
        );
      }
    }

    if (pendingMigrations.some(({ name }) => name === HISTORICAL_MIGRATION)) {
      adaptHistoricalQueryResult(queryRunner);
    }

    const completed = await executor.executePendingMigrations();
    return completed.map(({ name }) => name);
  } finally {
    await queryRunner.release();
    if (ownsConnection && connection.isInitialized) await connection.destroy();
  }
}

if (require.main === module) {
  Promise.resolve()
    .then(() => {
      configureRolesMigrationDiscovery(dataSource);
      return runRolesMigrationChain(dataSource);
    })
    .then((migrations) => {
      if (migrations.length === 0) {
        console.log('Las migraciones de roles ya están aplicadas.');
        return;
      }
      console.log(`Migraciones de roles aplicadas: ${migrations.join(', ')}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
