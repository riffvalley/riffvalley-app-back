import { DataSource, EntityManager, QueryRunner } from 'typeorm';

type TransactionPhase = 'connect' | 'start' | 'commit' | 'rollback' | 'release';

export class CatalogImportTransactionError extends Error {
  constructor(
    readonly phase: TransactionPhase,
    readonly originalError: unknown,
    readonly rollbackError?: unknown,
    readonly releaseError?: unknown,
  ) {
    super(`Catalog import transaction ${phase} failed`);
    this.name = CatalogImportTransactionError.name;
  }
}

export async function runCatalogImportTransaction<T>(
  dataSource: DataSource,
  operation: (entityManager: EntityManager) => Promise<T>,
): Promise<T> {
  let queryRunner: QueryRunner;
  try {
    queryRunner = dataSource.createQueryRunner();
  } catch (error) {
    throw new CatalogImportTransactionError('connect', error);
  }
  let transactionStarted = false;
  let hasFailure = false;
  let failure: unknown;
  let result: T;

  try {
    try {
      await queryRunner.connect();
    } catch (error) {
      failure = new CatalogImportTransactionError('connect', error);
      hasFailure = true;
    }

    if (!hasFailure) {
      try {
        await queryRunner.startTransaction();
        transactionStarted = true;
      } catch (error) {
        failure = new CatalogImportTransactionError('start', error);
        hasFailure = true;
      }
    }

    if (!hasFailure) {
      try {
        result = await operation(queryRunner.manager);
      } catch (error) {
        try {
          await queryRunner.rollbackTransaction();
          transactionStarted = false;
          failure = error;
        } catch (rollbackError) {
          failure = new CatalogImportTransactionError(
            'rollback',
            error,
            rollbackError,
          );
        }
        hasFailure = true;
      }
    }

    if (!hasFailure) {
      try {
        await queryRunner.commitTransaction();
        transactionStarted = false;
      } catch (error) {
        let rollbackError: unknown;
        if (transactionStarted) {
          try {
            await queryRunner.rollbackTransaction();
            transactionStarted = false;
          } catch (rollbackFailure) {
            rollbackError = rollbackFailure;
          }
        }
        failure = new CatalogImportTransactionError(
          'commit',
          error,
          rollbackError,
        );
        hasFailure = true;
      }
    }
  } finally {
    try {
      await queryRunner.release();
    } catch (error) {
      failure = new CatalogImportTransactionError(
        'release',
        hasFailure ? failure : error,
        undefined,
        hasFailure ? error : undefined,
      );
      hasFailure = true;
    }
  }

  if (hasFailure) {
    throw failure;
  }

  return result;
}
