import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeImportReceiptsByOperation1792130000000
  implements MigrationInterface
{
  name = 'ScopeImportReceiptsByOperation1792130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "catalog_import_row_receipts"
       ADD "operation" character varying(30) NOT NULL DEFAULT 'create-event'`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_catalog_import_row_receipts_identity"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_catalog_import_row_receipts_identity"
       ON "catalog_import_row_receipts" ("editor_id", "batch_id", "row_id", "operation")`,
    );
  }

  public async down(): Promise<void> {
    throw new Error(
      'This migration is intentionally irreversible: dropping operation-scoped identity could collide with persisted lineup receipts.',
    );
  }
}
