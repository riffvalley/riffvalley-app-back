import * as dotenv from 'dotenv';
import dataSource from '../../../data-source';
import {
  hasVerificationIssues,
  parseBackfillArguments,
  parsePendingKeyCounts,
  runMusicSearchKeyBackfill,
  validateBackfillTarget,
} from './music-search-key-backfill';

dotenv.config();

async function main(): Promise<void> {
  const options = parseBackfillArguments(process.argv.slice(2));
  validateBackfillTarget(process.env, options);

  dataSource.setOptions({
    entities: [],
    logging: false,
    migrations: [],
    migrationsRun: false,
    synchronize: false,
    installExtensions: false,
  });
  if (dataSource.options.synchronize || dataSource.options.migrationsRun) {
    throw new Error(
      'El datasource no satisface las salvaguardas de escritura.',
    );
  }

  await dataSource.initialize();
  try {
    const identity: unknown = await dataSource.query(
      'SELECT current_database() AS database, current_schema() AS schema',
    );
    if (
      !Array.isArray(identity) ||
      typeof identity[0]?.database !== 'string' ||
      typeof identity[0]?.schema !== 'string' ||
      identity[0].database !== options.confirmTarget ||
      !/^[a-z_][a-z0-9_]*$/u.test(identity[0].schema)
    ) {
      throw new Error(
        'La identidad de PostgreSQL no coincide con el destino confirmado.',
      );
    }

    const results = await runMusicSearchKeyBackfill(
      (sql, parameters) => dataSource.query(sql, parameters),
      identity[0].schema,
      {
        mode: options.mode,
        batchSize: options.batchSize,
        report: (tableName, counts) => {
          console.log(
            `${tableName}: lotes=${counts.batches}, leídos=${counts.scanned}, candidatos=${counts.candidates}, actualizados=${counts.updated}, omitidos=${counts.skipped}, concurrencia=${counts.skippedConcurrent}, fallidos=${counts.failed}, pendientes=${counts.missing}, inconsistentes=${counts.inconsistent}, clave-vacía=${counts.emptyNormalized}`,
          );
        },
      },
    );

    for (const [tableName, counts] of Object.entries(results)) {
      console.log(
        `${tableName} ejemplos (máximo 5): ${JSON.stringify(counts.examples)}`,
      );
    }

    if (options.mode === 'apply') {
      const pendingResult: unknown = await dataSource.query(`
        SELECT 'artist' AS table_name, COUNT(*)::int AS count
          FROM "${identity[0].schema}"."artist"
         WHERE "search_name_normalized" IS NULL
        UNION ALL
        SELECT 'disc' AS table_name, COUNT(*)::int AS count
          FROM "${identity[0].schema}"."disc"
         WHERE "search_name_normalized" IS NULL
      `);
      if (!Array.isArray(pendingResult)) {
        throw new Error('No se pudo reconciliar el progreso del backfill.');
      }
      const pendingCounts = parsePendingKeyCounts(pendingResult);
      console.log(
        `Registros todavía sin clave: ${JSON.stringify(pendingCounts)}`,
      );
      const emptyNames = Object.values(results).some(
        (counts) => counts.emptyNormalized > 0,
      );
      if (Object.values(pendingCounts).some((count) => count > 0)) {
        throw new Error(
          emptyNames
            ? 'Quedan nombres que normalizan a vacío; requieren revisión explícita.'
            : 'Quedan claves NULL; vuelve a ejecutar --apply y luego --verify.',
        );
      }
    }

    if (options.mode === 'verify' && hasVerificationIssues(results)) {
      throw new Error(
        'La verificación detectó claves pendientes, discrepantes o que requieren revisión.',
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error(`Backfill de claves de búsqueda detenido: ${message}`);
    process.exitCode = 1;
  });
}
