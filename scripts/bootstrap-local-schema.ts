import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as dotenv from 'dotenv';
import type { DataSource } from 'typeorm';
import {
  DockerInspection,
  LOCAL_BOOTSTRAP_TARGET,
  validateBootstrapEnvironment,
  validateDockerInspection,
  validateResetConfirmation,
} from './local-bootstrap-guards';

dotenv.config();

function inspectLocalContainer(): string[] {
  let output: string;
  try {
    output = execFileSync('docker', ['inspect', LOCAL_BOOTSTRAP_TARGET.container], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error(
      `No se pudo inspeccionar Docker ${LOCAL_BOOTSTRAP_TARGET.container}; no se modificó la base.`,
    );
  }

  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error('Docker devolvió una identidad de contenedor inesperada.');
  }
  const item = parsed[0] as {
    Name?: unknown;
    Config?: { Image?: unknown };
    State?: { Status?: unknown };
    NetworkSettings?: {
      Ports?: unknown;
      Networks?: unknown;
    };
  };
  const inspection: DockerInspection = {
    name: String(item.Name ?? ''),
    image: String(item.Config?.Image ?? ''),
    status: String(item.State?.Status ?? ''),
    ports: (item.NetworkSettings?.Ports ?? {}) as DockerInspection['ports'],
    networks: (item.NetworkSettings?.Networks ?? {}) as DockerInspection['networks'],
  };
  return validateDockerInspection(inspection);
}

async function requestResetConfirmation(database: string): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      `La base contiene objetos. Ejecuta en una terminal interactiva y escribe exactamente "REINICIAR ${database}" para continuar; no se modificó el esquema.`,
    );
  }
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question(
      `Se eliminará todo el esquema public de ${database}. Escribe exactamente "REINICIAR ${database}": `,
    );
    validateResetConfirmation(answer, database);
  } finally {
    terminal.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verifyOnly = args.length === 1 && args[0] === '--verify-only';
  if (args.length > 0 && !verifyOnly) {
    throw new Error('El único argumento admitido es --verify-only.');
  }

  validateBootstrapEnvironment(process.env);
  const containerAddresses = inspectLocalContainer();

  // Load entity metadata only after validating the explicit local destination.
  const { default: dataSource } = require('../src/data-source') as {
    default: DataSource;
  };
  dataSource.setOptions({
    installExtensions: false,
    logging: [],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
  });
  if (dataSource.options.synchronize || dataSource.options.migrationsRun) {
    throw new Error('El datasource no satisface las salvaguardas esperadas.');
  }

  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  let lockAcquired = false;
  try {
    await queryRunner.connect();
    const identity = (await queryRunner.query(`
      SELECT current_database() AS database,
             current_user AS username,
             host(inet_server_addr()) AS server_address,
             inet_server_port() AS server_port,
             current_setting('server_version_num') AS server_version_num,
             pg_get_userbyid(database_record.datdba) AS database_owner
      FROM pg_database AS database_record
      WHERE database_record.datname = current_database()
    `)) as Array<{
      database: string;
      username: string;
      server_address: string;
      server_port: number;
      server_version_num: string;
      database_owner: string;
    }>;
    const target = identity[0];
    if (
      !target ||
      target.database !== LOCAL_BOOTSTRAP_TARGET.database ||
      target.username !== process.env.DB_USERNAME ||
      target.database_owner !== process.env.DB_USERNAME ||
      Number(target.server_port) !== LOCAL_BOOTSTRAP_TARGET.postgresPort ||
      !containerAddresses.includes(target.server_address) ||
      !target.server_version_num.startsWith('17')
    ) {
      throw new Error(
        'La conexión no coincide con spammusicdb / SpamMusicDB / PostgreSQL 17; no se modificó el esquema.',
      );
    }

    await queryRunner.query('SELECT pg_advisory_lock($1, $2)', [20261020, 54317]);
    lockAcquired = true;

    const otherSchemas = (await queryRunner.query(`
      SELECT namespace.nspname AS name
      FROM pg_namespace AS namespace
      WHERE namespace.nspname NOT IN ('public', 'information_schema')
        AND namespace.nspname NOT LIKE 'pg_%'
      LIMIT 1
    `)) as Array<{ name: string }>;
    if (otherSchemas.length > 0) {
      throw new Error(
        `Existe el esquema ${otherSchemas[0].name} fuera de public; no se modificó la base.`,
      );
    }

    const publicObjects = (await queryRunner.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_class AS relation
          WHERE relation.relnamespace = 'public'::regnamespace
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        ) OR EXISTS (
          SELECT 1 FROM pg_proc AS procedure
          WHERE procedure.pronamespace = 'public'::regnamespace
        ) OR EXISTS (
          SELECT 1 FROM pg_type AS type
          WHERE type.typnamespace = 'public'::regnamespace
            AND type.typtype IN ('e', 'd')
        ) AS exists
    `)) as Array<{ exists: boolean }>;
    const publicSchemaIsDirty = publicObjects[0]?.exists === true;

    if (verifyOnly && !publicSchemaIsDirty) {
      throw new Error('public está vacío; no hay esquema que verificar.');
    }
    if (!verifyOnly && publicSchemaIsDirty) {
      await requestResetConfirmation(LOCAL_BOOTSTRAP_TARGET.database);
      await queryRunner.query('DROP SCHEMA public CASCADE');
      await queryRunner.query('CREATE SCHEMA public AUTHORIZATION CURRENT_USER');
    }

    const expectedTables = dataSource.entityMetadatas
      .filter((metadata) => metadata.synchronize && metadata.tableType === 'regular')
      .map((metadata) => metadata.tableName);
    if (!verifyOnly) {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await dataSource.synchronize(false);
    }

    const actualRows = (await queryRunner.query(`
      SELECT relation.relname AS name
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
      ORDER BY relation.relname
    `)) as Array<{ name: string }>;
    const actualTables = new Set(actualRows.map(({ name }) => name));
    const missingTables = expectedTables.filter((name) => !actualTables.has(name));
    const unexpectedTables = [...actualTables].filter(
      (name) => !expectedTables.includes(name),
    );
    if (missingTables.length || unexpectedTables.length) {
      throw new Error(
        `Diferencia de tablas: faltan [${missingTables.join(', ')}], sobran [${unexpectedTables.join(', ')}].`,
      );
    }
    if (actualTables.has('migrations')) {
      throw new Error('El bootstrap no debe crear public.migrations.');
    }

    const ledger = (await queryRunner.query(`
      SELECT to_regclass('public.migrations') AS ledger
    `)) as Array<{ ledger: string | null }>;
    if (ledger[0]?.ledger) {
      throw new Error('Se detectó public.migrations; no se altera ni fabrica el ledger.');
    }

    const operation = verifyOnly ? 'Verificación' : 'Bootstrap';
    console.log(
      `${operation} correcto: PostgreSQL 17 local, ${actualTables.size} tablas del esquema actual, sin ledger de migraciones. Las 92 migraciones siguen pendientes y no deben ejecutarse sobre este bootstrap.`,
    );
  } finally {
    if (lockAcquired) {
      await queryRunner.query('SELECT pg_advisory_unlock($1, $2)', [20261020, 54317]);
    }
    await queryRunner.release();
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error(`Bootstrap local detenido: ${message}`);
    process.exitCode = 1;
  });
}
