import { MigrationInterface, QueryRunner } from 'typeorm';

type ExistingOperationFingerprints = {
  has_fingerprints: boolean;
};

export class AddRefreshOperationFingerprint1791960000000
  implements MigrationInterface
{
  name = 'AddRefreshOperationFingerprint1791960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "auth_refresh_tokens" ADD COLUMN "operation_key_hash" bytea',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM "auth_refresh_tokens"
        WHERE "operation_key_hash" IS NOT NULL
      ) AS "has_fingerprints"
    `)) as ExistingOperationFingerprints[];

    if (rows[0]?.has_fingerprints) {
      throw new Error(
        'Rollback de metadata de refresh cancelado: existen huellas de operación; eliminarlas requiere una decisión explícita.',
      );
    }

    await queryRunner.query(
      'ALTER TABLE "auth_refresh_tokens" DROP COLUMN "operation_key_hash"',
    );
  }
}
