import { normalizeMusicName } from './normalize-music-name';

export type BackfillMode = 'dry-run' | 'apply' | 'verify';

export type BackfillRecord = {
  id: string;
  name: string;
  search_name_normalized: string | null;
};

export type BackfillTable = {
  tableName: 'artist' | 'disc';
  nameColumn: 'name';
};

export type BackfillQuery = (
  sql: string,
  parameters?: unknown[],
) => Promise<unknown>;

export type BackfillCounts = {
  scanned: number;
  candidates: number;
  updated: number;
  skipped: number;
  skippedConcurrent: number;
  failed: number;
  missing: number;
  inconsistent: number;
  emptyNormalized: number;
  batches: number;
  examples: Array<{
    id: string;
    name: string;
    expected: string;
    actual: string | null;
  }>;
};

export type BackfillOptions = {
  mode: BackfillMode;
  batchSize: number;
  exampleLimit?: number;
  report?: (tableName: string, counts: BackfillCounts) => void;
};

const TABLES: readonly BackfillTable[] = [
  { tableName: 'artist', nameColumn: 'name' },
  { tableName: 'disc', nameColumn: 'name' },
];
const LOCAL_TEST_DATABASE = 'music_search_migration_test';
const MODE_ARGUMENTS: Record<
  '--dry-run' | '--apply' | '--verify',
  BackfillMode
> = {
  '--dry-run': 'dry-run',
  '--apply': 'apply',
  '--verify': 'verify',
};

const EMPTY_COUNTS = (): BackfillCounts => ({
  scanned: 0,
  candidates: 0,
  updated: 0,
  skipped: 0,
  skippedConcurrent: 0,
  failed: 0,
  missing: 0,
  inconsistent: 0,
  emptyNormalized: 0,
  batches: 0,
  examples: [],
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRows(value: unknown): BackfillRecord[] {
  if (!Array.isArray(value))
    throw new Error('PostgreSQL devolvió filas inválidas.');

  return value.map((row: unknown) => {
    const normalizedKey = isRecord(row)
      ? row.search_name_normalized
      : undefined;
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      (normalizedKey !== null && typeof normalizedKey !== 'string')
    ) {
      throw new Error('PostgreSQL devolvió una fila de backfill inválida.');
    }
    return {
      id: row.id,
      name: row.name,
      search_name_normalized:
        typeof normalizedKey === 'string' ? normalizedKey : null,
    };
  });
}

function parseUpdatedRowCount(value: unknown): number {
  if (Array.isArray(value) && value.length === 2) {
    const [rows, affectedRows] = value;
    if (
      Array.isArray(rows) &&
      typeof affectedRows === 'number' &&
      Number.isSafeInteger(affectedRows) &&
      affectedRows >= 0 &&
      rows.length === affectedRows
    ) {
      return affectedRows;
    }
  }
  if (Array.isArray(value) && value.length === 0) return 0;
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    isRecord(value[0]) &&
    typeof value[0].id === 'string'
  ) {
    return 1;
  }
  throw new Error('PostgreSQL devolvió un resultado UPDATE inválido.');
}

function qualifiedTable(schema: string, tableName: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(schema)) {
    throw new Error('El esquema PostgreSQL contiene un nombre inesperado.');
  }
  return `"${schema}"."${tableName}"`;
}

function recordExample(
  counts: BackfillCounts,
  row: BackfillRecord,
  expected: string,
  exampleLimit: number,
): void {
  if (
    counts.examples.length < exampleLimit &&
    !counts.examples.some((example) => example.id === row.id)
  ) {
    counts.examples.push({
      id: row.id,
      name: row.name,
      expected,
      actual: row.search_name_normalized,
    });
  }
}

export function parseBackfillArguments(args: string[]): {
  mode: BackfillMode;
  batchSize: number;
  confirmTarget: string;
  allowProduction: boolean;
} {
  let mode: BackfillMode | undefined;
  let batchSize = 200;
  let batchSizeWasSet = false;
  let confirmTarget: string | undefined;
  let allowProduction = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      argument === '--dry-run' ||
      argument === '--apply' ||
      argument === '--verify'
    ) {
      if (mode)
        throw new Error(
          'Indica exactamente uno de --dry-run, --apply o --verify.',
        );
      mode = MODE_ARGUMENTS[argument];
    } else if (argument === '--batch-size') {
      if (batchSizeWasSet)
        throw new Error('--batch-size solo puede indicarse una vez.');
      batchSizeWasSet = true;
      const rawValue = args[index + 1];
      index += 1;
      if (!rawValue || !/^\d+$/u.test(rawValue)) {
        throw new Error('--batch-size requiere un entero positivo.');
      }
      batchSize = Number(rawValue);
      if (
        !Number.isSafeInteger(batchSize) ||
        batchSize < 1 ||
        batchSize > 5000
      ) {
        throw new Error('--batch-size debe estar entre 1 y 5000.');
      }
    } else if (argument === '--confirm-target') {
      if (confirmTarget) {
        throw new Error('--confirm-target solo puede indicarse una vez.');
      }
      confirmTarget = args[index + 1];
      index += 1;
      if (!confirmTarget || confirmTarget.startsWith('--')) {
        throw new Error(
          '--confirm-target requiere el nombre exacto de la base de datos.',
        );
      }
    } else if (argument === '--allow-production') {
      if (allowProduction) {
        throw new Error('--allow-production solo puede indicarse una vez.');
      }
      allowProduction = true;
    } else {
      throw new Error(`Argumento no reconocido: ${argument}`);
    }
  }

  if (!mode)
    throw new Error(
      'Se requiere exactamente uno de --dry-run, --apply o --verify.',
    );
  if (!confirmTarget)
    throw new Error('Se requiere --confirm-target <nombre-exacto-de-base>.');
  return { mode, batchSize, confirmTarget, allowProduction };
}

export function validateBackfillTarget(
  environment: Record<string, string | undefined>,
  options: Pick<
    ReturnType<typeof parseBackfillArguments>,
    'confirmTarget' | 'allowProduction'
  >,
): void {
  if (environment.DATABASE_URL && environment.STAGE !== 'prod') {
    throw new Error(
      'No se admite DATABASE_URL: valida DB_HOST/DB_NAME como destino explícito.',
    );
  }
  if (!environment.DB_NAME || environment.DB_NAME !== options.confirmTarget) {
    throw new Error('--confirm-target debe coincidir exactamente con DB_NAME.');
  }
  if (!environment.DB_HOST || !environment.DB_PORT) {
    throw new Error(
      'DB_HOST y DB_PORT son obligatorios para validar el destino.',
    );
  }
  if (
    !/^\d+$/u.test(environment.DB_PORT) ||
    Number(environment.DB_PORT) < 1 ||
    Number(environment.DB_PORT) > 65535
  ) {
    throw new Error('DB_PORT debe ser un puerto TCP válido.');
  }

  if (environment.STAGE === 'prod') {
    if (!options.allowProduction) {
      throw new Error(
        'Producción requiere --allow-production y --confirm-target explícitos.',
      );
    }
    return;
  }

  if (options.allowProduction) {
    throw new Error('--allow-production solo puede utilizarse con STAGE=prod.');
  }
  if (
    environment.STAGE !== 'dev' ||
    !['localhost', '127.0.0.1', '::1'].includes(environment.DB_HOST) ||
    environment.DB_NAME !== LOCAL_TEST_DATABASE
  ) {
    throw new Error(
      `En STAGE=dev solo se admite PostgreSQL local en ${LOCAL_TEST_DATABASE}.`,
    );
  }
}

export async function validateBackfillSchema(
  query: BackfillQuery,
  schema: string,
): Promise<void> {
  const result = await query(
    `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = $1
        AND (table_name, column_name) IN (
          ('artist', 'id'), ('artist', 'name'), ('artist', 'search_name_normalized'),
          ('disc', 'id'), ('disc', 'name'), ('disc', 'search_name_normalized')
        )`,
    [schema],
  );
  if (!Array.isArray(result))
    throw new Error('No se pudo validar el esquema de backfill.');

  const columns = new Map<string, Record<string, unknown>>();
  const columnRows: unknown[] = result;
  for (const item of columnRows) {
    if (
      isRecord(item) &&
      typeof item.table_name === 'string' &&
      typeof item.column_name === 'string'
    ) {
      columns.set(`${item.table_name}.${item.column_name}`, item);
    }
  }

  for (const table of TABLES) {
    for (const column of ['id', table.nameColumn, 'search_name_normalized']) {
      if (!columns.has(`${table.tableName}.${column}`)) {
        throw new Error(
          `Falta la columna ${table.tableName}.${column}; no se inició el backfill.`,
        );
      }
    }
    const keyColumn = columns.get(`${table.tableName}.search_name_normalized`);
    if (keyColumn?.data_type !== 'text' || keyColumn.is_nullable !== 'YES') {
      throw new Error(
        `${table.tableName}.search_name_normalized debe ser text nullable.`,
      );
    }
  }
}

export async function runMusicSearchKeyBackfill(
  query: BackfillQuery,
  schema: string,
  options: BackfillOptions,
): Promise<Record<'artist' | 'disc', BackfillCounts>> {
  if (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('El tamaño de lote debe ser un entero positivo.');
  }
  await validateBackfillSchema(query, schema);
  const results = { artist: EMPTY_COUNTS(), disc: EMPTY_COUNTS() };
  const exampleLimit = options.exampleLimit ?? 5;

  for (const table of TABLES) {
    const counts = results[table.tableName];
    const qualified = qualifiedTable(schema, table.tableName);
    let cursor: string | null = null;

    while (true) {
      const keyFilter =
        options.mode === 'verify' ? '' : 'AND "search_name_normalized" IS NULL';
      let rows: BackfillRecord[];
      try {
        rows = parseRows(
          await query(
            `SELECT "id", "${table.nameColumn}" AS "name", "search_name_normalized"
             FROM ${qualified}
            WHERE ($1::uuid IS NULL OR "id" > $1::uuid)
              ${keyFilter}
            ORDER BY "id"
            LIMIT $2`,
            [cursor, options.batchSize],
          ),
        );
      } catch (error: unknown) {
        counts.failed += 1;
        options.report?.(table.tableName, counts);
        const message =
          error instanceof Error ? error.message : 'error desconocido';
        throw new Error(
          `${table.tableName}, lote ${counts.batches + 1}, cursor ${cursor ?? 'inicio'}: ${message}`,
        );
      }
      if (rows.length === 0) break;

      counts.batches += 1;
      counts.scanned += rows.length;
      cursor = rows[rows.length - 1].id;

      for (const row of rows) {
        try {
          const expected = normalizeMusicName(row.name);
          if (expected.length === 0) {
            counts.emptyNormalized += 1;
            recordExample(counts, row, expected, exampleLimit);
          }

          if (options.mode === 'verify') {
            if (row.search_name_normalized === null) {
              counts.missing += 1;
              recordExample(counts, row, expected, exampleLimit);
            } else if (row.search_name_normalized !== expected) {
              counts.inconsistent += 1;
              recordExample(counts, row, expected, exampleLimit);
            }
            continue;
          }

          counts.candidates += 1;
          recordExample(counts, row, expected, exampleLimit);
          if (options.mode === 'dry-run') continue;
          if (expected.length === 0) {
            counts.skipped += 1;
            continue;
          }

          const updated = await query(
            `UPDATE ${qualified}
                SET "search_name_normalized" = $1
              WHERE "id" = $2::uuid
                AND "${table.nameColumn}" = $3
                AND "search_name_normalized" IS NULL
            RETURNING "id"`,
            [expected, row.id, row.name],
          );
          const updatedRows = parseUpdatedRowCount(updated);
          if (updatedRows === 1) counts.updated += 1;
          else {
            counts.skipped += 1;
            counts.skippedConcurrent += 1;
          }
        } catch (error: unknown) {
          counts.failed += 1;
          options.report?.(table.tableName, counts);
          const message =
            error instanceof Error ? error.message : 'error desconocido';
          throw new Error(
            `${table.tableName}, lote ${counts.batches}, id ${row.id}: ${message}`,
          );
        }
      }

      options.report?.(table.tableName, counts);
    }
    options.report?.(table.tableName, counts);
  }

  return results;
}

export function hasVerificationIssues(
  results: Record<'artist' | 'disc', BackfillCounts>,
): boolean {
  return Object.values(results).some(
    ({ missing, inconsistent, emptyNormalized }) =>
      missing > 0 || inconsistent > 0 || emptyNormalized > 0,
  );
}

export function parsePendingKeyCounts(
  value: unknown,
): Record<'artist' | 'disc', number> {
  if (!Array.isArray(value) || value.length !== TABLES.length) {
    throw new Error(
      'La reconciliación devolvió un número inesperado de tablas.',
    );
  }
  const counts: Partial<Record<'artist' | 'disc', number>> = {};
  const rows: unknown[] = value;
  for (const row of rows) {
    if (
      !isRecord(row) ||
      (row.table_name !== 'artist' && row.table_name !== 'disc') ||
      (typeof row.count !== 'number' && typeof row.count !== 'string') ||
      !Number.isSafeInteger(Number(row.count)) ||
      Number(row.count) < 0 ||
      counts[row.table_name] !== undefined
    ) {
      throw new Error('La reconciliación devolvió conteos inválidos.');
    }
    counts[row.table_name] = Number(row.count);
  }
  if (counts.artist === undefined || counts.disc === undefined) {
    throw new Error('La reconciliación no incluyó ambas tablas.');
  }
  return { artist: counts.artist, disc: counts.disc };
}
