import { execFileSync } from 'node:child_process';
import type { DataSource } from 'typeorm';

const EXPECTED = {
  optIn: 'CATALOG_TEST_BOOTSTRAP',
  container: 'riffvalley-catalog-test-pg-20261015',
  image: 'postgres:17',
  host: '127.0.0.1',
  hostPort: '55432',
  database: 'riffvalley_catalog_test_20261015',
  username: 'riffvalley_catalog_test',
  postgresPort: 5432,
} as const;

const CATALOG_TABLES = [
  'artist',
  'comment',
  'country',
  'disc',
  'favorite',
  'genre',
  'pending',
  'rate',
  'users',
] as const;

const CATALOG_RELATIONS = [
  ['artist', 'country'],
  ['comment', 'disc'],
  ['disc', 'artist'],
  ['disc', 'genre'],
  ['favorite', 'disc'],
  ['pending', 'disc'],
  ['rate', 'disc'],
] as const;

type DockerInspection = {
  name: string;
  image: string;
  status: string;
  binds: string[] | null;
  mounts: Array<{
    Type: string;
    Name?: string;
    Source?: string;
    Destination: string;
  }>;
  ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
  networks: Record<string, { IPAddress: string }>;
};

function requireValue(name: string, expected: string): void {
  if (process.env[name] !== expected) {
    throw new Error(`${name} debe ser exactamente ${expected}.`);
  }
}

function inspectDisposableContainer(): string[] {
  const format =
    '{{json .Name}}|{{json .Config.Image}}|{{json .State.Status}}|{{json .HostConfig.Binds}}|{{json .Mounts}}|{{json .NetworkSettings.Ports}}|{{json .NetworkSettings.Networks}}';

  let output: string;
  try {
    output = execFileSync(
      'docker',
      ['inspect', '--format', format, EXPECTED.container],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    throw new Error(
      `No se pudo inspeccionar el contenedor de pruebas ${EXPECTED.container}.`,
    );
  }

  const fields = output.split('|');
  if (fields.length !== 7) {
    throw new Error('Docker devolvió una inspección incompleta.');
  }

  const inspection: DockerInspection = {
    name: JSON.parse(fields[0]),
    image: JSON.parse(fields[1]),
    status: JSON.parse(fields[2]),
    binds: JSON.parse(fields[3]),
    mounts: JSON.parse(fields[4]),
    ports: JSON.parse(fields[5]),
    networks: JSON.parse(fields[6]),
  };

  const portBindings = inspection.ports['5432/tcp'] ?? [];
  const hasOnlyExpectedLoopbackBinding =
    Object.keys(inspection.ports).length === 1 &&
    portBindings.length === 1 &&
    portBindings[0].HostIp === EXPECTED.host &&
    portBindings[0].HostPort === EXPECTED.hostPort;
  const hasOnlyAnonymousDataVolume =
    inspection.binds === null &&
    inspection.mounts.length === 1 &&
    inspection.mounts[0].Type === 'volume' &&
    inspection.mounts[0].Destination === '/var/lib/postgresql/data' &&
    /^[0-9a-f]{64}$/.test(inspection.mounts[0].Name ?? '');

  if (
    inspection.name !== `/${EXPECTED.container}` ||
    inspection.image !== EXPECTED.image ||
    inspection.status !== 'running' ||
    !hasOnlyExpectedLoopbackBinding ||
    !hasOnlyAnonymousDataVolume
  ) {
    throw new Error(
      'El contenedor no coincide con la identidad aislada esperada; no se modificó la base.',
    );
  }

  const addresses = Object.values(inspection.networks)
    .map(({ IPAddress }) => IPAddress)
    .filter(Boolean);
  if (addresses.length === 0) {
    throw new Error('Docker no informó una IP para el contenedor esperado.');
  }

  return addresses;
}

function metadataForeignKeyKey(
  source: string,
  target: string,
  columns: string[],
): string {
  return JSON.stringify([source, target, [...columns].sort()]);
}

async function main(): Promise<void> {
  const verifyOnly = process.argv.slice(2).includes('--verify-only');
  if (process.argv.slice(2).some((argument) => argument !== '--verify-only')) {
    throw new Error('El único argumento admitido es --verify-only.');
  }

  requireValue(EXPECTED.optIn, '1');
  requireValue('STAGE', 'dev');
  requireValue('DB_HOST', EXPECTED.host);
  requireValue('DB_PORT', EXPECTED.hostPort);
  requireValue('DB_NAME', EXPECTED.database);
  requireValue('DB_USERNAME', EXPECTED.username);
  const testPassword = process.env.CATALOG_TEST_DB_PASSWORD;
  if (!testPassword) {
    throw new Error(
      'CATALOG_TEST_DB_PASSWORD debe contener la credencial local de pruebas.',
    );
  }
  if (process.env.DATABASE_URL) {
    throw new Error('No se admite DATABASE_URL en el bootstrap de pruebas.');
  }

  // Override any DB_PASSWORD inherited from the shell or .env with the
  // credential explicitly supplied for this disposable database.
  process.env.DB_PASSWORD = testPassword;

  const containerAddresses = inspectDisposableContainer();

  // Load dotenv-backed application metadata only after explicit test-target checks.
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
      SELECT
        current_database() AS database,
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
      target.database !== EXPECTED.database ||
      target.username !== EXPECTED.username ||
      target.database_owner !== EXPECTED.username ||
      Number(target.server_port) !== EXPECTED.postgresPort ||
      !containerAddresses.includes(target.server_address) ||
      !target.server_version_num.startsWith('17')
    ) {
      throw new Error(
        `La conexión PostgreSQL no coincide con el contenedor y la base desechables (${JSON.stringify(target ?? null)}); no se modificó el esquema.`,
      );
    }

    await queryRunner.query(
      'SELECT pg_advisory_lock($1, $2)',
      [20261015, 33003],
    );
    lockAcquired = true;

    const publicRelations = (await queryRunner.query(`
      SELECT relation.relname AS name
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      ORDER BY relation.relname
    `)) as Array<{ name: string }>;
    if (publicRelations.length > 0 && !verifyOnly) {
      throw new Error(
        'public contiene objetos; el bootstrap solo se ejecuta en una base vacía. No se modificó el esquema.',
      );
    }
    if (publicRelations.length === 0 && verifyOnly) {
      throw new Error(
        'No hay objetos públicos que verificar; ejecuta el bootstrap explícito en la base vacía.',
      );
    }

    if (!verifyOnly) {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await dataSource.synchronize(false);
    }

    const entityTables = dataSource.entityMetadatas
      .filter(
        (metadata) => metadata.synchronize && metadata.tableType === 'regular',
      )
      .map((metadata) => metadata.tableName);
    const tableRows = (await queryRunner.query(`
      SELECT relation.relname AS name
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
      ORDER BY relation.relname
    `)) as Array<{ name: string }>;
    const actualTables = new Set(tableRows.map(({ name }) => name));
    const missingTables = entityTables.filter(
      (name) => !actualTables.has(name),
    );
    const unexpectedTables = [...actualTables].filter(
      (name) => !entityTables.includes(name),
    );
    if (missingTables.length > 0 || unexpectedTables.length > 0) {
      throw new Error(
        `Tablas faltantes de metadata: ${missingTables.join(', ')}; tablas inesperadas: ${unexpectedTables.join(', ')}.`,
      );
    }

    const foreignKeys = (await queryRunner.query(`
      SELECT
        source.relname AS source_table,
        target.relname AS target_table,
        to_json(ARRAY(
          SELECT column_attribute.attname
          FROM unnest(constraint_record.conkey) WITH ORDINALITY AS key_column(attnum, position)
          JOIN pg_attribute AS column_attribute
            ON column_attribute.attrelid = constraint_record.conrelid
           AND column_attribute.attnum = key_column.attnum
          ORDER BY key_column.position
        )) AS columns
      FROM pg_constraint AS constraint_record
      JOIN pg_class AS source
        ON source.oid = constraint_record.conrelid
      JOIN pg_class AS target
        ON target.oid = constraint_record.confrelid
      WHERE constraint_record.contype = 'f'
        AND source.relnamespace = 'public'::regnamespace
    `)) as Array<{
      source_table: string;
      target_table: string;
      columns: string[];
    }>;
    const actualForeignKeys = new Set(
      foreignKeys.map(({ source_table, target_table, columns }) =>
        metadataForeignKeyKey(source_table, target_table, columns),
      ),
    );
    const expectedForeignKeys = dataSource.entityMetadatas.flatMap((metadata) =>
      metadata.foreignKeys.map((foreignKey) =>
        metadataForeignKeyKey(
          metadata.tableName,
          foreignKey.referencedEntityMetadata.tableName,
          foreignKey.columnNames,
        ),
      ),
    );
    const missingForeignKeys = expectedForeignKeys.filter(
      (key) => !actualForeignKeys.has(key),
    );
    if (missingForeignKeys.length > 0) {
      throw new Error(
        `Faltan claves foráneas de la metadata TypeORM (${missingForeignKeys.length}/${expectedForeignKeys.length}); esperadas=${JSON.stringify(missingForeignKeys.slice(0, 4).map((key) => JSON.parse(key)))}; encontradas=${JSON.stringify([...actualForeignKeys].slice(0, 4).map((key) => JSON.parse(key)))}.`,
      );
    }

    for (const [source, target] of CATALOG_RELATIONS) {
      if (
        !foreignKeys.some(
          (foreignKey) =>
            foreignKey.source_table === source &&
            foreignKey.target_table === target,
        )
      ) {
        throw new Error(`Falta la relación Catalog ${source} → ${target}.`);
      }
    }

    const catalogTablesPresent = CATALOG_TABLES.every((table) =>
      actualTables.has(table),
    );
    if (!catalogTablesPresent || actualTables.has('migrations')) {
      throw new Error(
        'Falta una tabla requerida de Catalog o apareció un ledger de migraciones.',
      );
    }

    const schemaDiff = await dataSource.driver.createSchemaBuilder().log();
    let equivalentDiffsVerified = 0;
    if (schemaDiff.upQueries.length > 0 || schemaDiff.downQueries.length > 0) {
      const contentTypeColumn = dataSource.entityMetadatas
        .find((metadata) => metadata.tableName === 'content')
        ?.columns.find((column) => column.enumName === 'content_type_enum');
      const enumValues = contentTypeColumn?.enum;
      const expectedNoOpDiffs = [
        'ALTER TYPE "public"."content_type_enum" RENAME TO "content_type_enum_old"',
        `CREATE TYPE "public"."content_type_enum" AS ENUM(${(enumValues ?? []).map((value) => `'${String(value).replaceAll("'", "''")}'`).join(', ')})`,
        'ALTER TABLE "content" ALTER COLUMN "type" TYPE "public"."content_type_enum" USING "type"::"text"::"public"."content_type_enum"',
        'DROP TYPE "public"."content_type_enum_old"',
        `ALTER TABLE "riff_valley_playlist_artists" ALTER COLUMN "tracks" SET DEFAULT '[]'::jsonb`,
        `ALTER TABLE "riff_valley_playlists" ALTER COLUMN "protected_track_uris" SET DEFAULT '[]'::jsonb`,
      ];
      const expectedDiffSet = new Set(expectedNoOpDiffs);
      const actualDiffSet = new Set(
        schemaDiff.upQueries.map(({ query }) => query.trim()),
      );
      const onlyKnownNoOpDiffs =
        enumValues?.length &&
        schemaDiff.downQueries.length === schemaDiff.upQueries.length &&
        actualDiffSet.size === expectedDiffSet.size &&
        [...actualDiffSet].every((query) => expectedDiffSet.has(query));

      if (!onlyKnownNoOpDiffs) {
        throw new Error(
          `El esquema difiere de la metadata TypeORM actual (${schemaDiff.upQueries.length} cambios): ${JSON.stringify(schemaDiff.upQueries.map(({ query }) => query))}`,
        );
      }

      const enumRows = (await queryRunner.query(`
        SELECT enum.enumlabel AS label
        FROM pg_type AS type
        JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
        JOIN pg_enum AS enum ON enum.enumtypid = type.oid
        WHERE namespace.nspname = 'public' AND type.typname = 'content_type_enum'
        ORDER BY enum.enumsortorder
      `)) as Array<{ label: string }>;
      if (
        JSON.stringify(enumRows.map(({ label }) => label)) !==
        JSON.stringify(enumValues)
      ) {
        throw new Error(
          'Los valores PostgreSQL de content_type_enum difieren de la metadata TypeORM.',
        );
      }

      const defaults = (await queryRunner.query(`
        SELECT table_name, column_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (
            ('riff_valley_playlist_artists', 'tracks'),
            ('riff_valley_playlists', 'protected_track_uris')
          )
      `)) as Array<{
        table_name: string;
        column_name: string;
        column_default: string | null;
      }>;
      const expectedDefaults = [
        ['riff_valley_playlist_artists', 'tracks'],
        ['riff_valley_playlists', 'protected_track_uris'],
      ];
      const expectedDefaultKeys = new Set(
        expectedDefaults.map(([table, column]) => `${table}.${column}`),
      );
      if (
        defaults.length !== expectedDefaults.length ||
        defaults.some(
          ({ table_name, column_name, column_default }) =>
            column_default !== "'[]'::jsonb" ||
            !expectedDefaultKeys.has(`${table_name}.${column_name}`),
        )
      ) {
        throw new Error(
          'Los defaults JSONB detectados por PostgreSQL no coinciden con el esquema TypeORM actual.',
        );
      }
      equivalentDiffsVerified = actualDiffSet.size;
    }

    console.log(
      `Esquema de prueba ${verifyOnly ? 'verificado' : 'creado'} en ${EXPECTED.database}: ${entityTables.length} tablas, ${foreignKeys.length} claves foráneas, metadata compatible${equivalentDiffsVerified ? ` (${equivalentDiffsVerified} diferencias TypeORM verificadas como equivalentes)` : ''}; ledger migrations ausente como se esperaba.`,
    );
  } finally {
    if (lockAcquired) {
      await queryRunner.query(
        'SELECT pg_advisory_unlock($1, $2)',
        [20261015, 33003],
      );
    }
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    `No se completó el bootstrap seguro: ${error instanceof Error ? error.message : 'error desconocido'}`,
  );
  process.exitCode = 1;
});
