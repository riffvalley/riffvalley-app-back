import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionCleanupIndex1791970000000 implements MigrationInterface {
  name = 'AddSessionCleanupIndex1791970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_sessions_revoked_at" ON "auth_sessions" ("revoked_at") WHERE "revoked_at" IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_auth_sessions_revoked_at"');
  }
}
