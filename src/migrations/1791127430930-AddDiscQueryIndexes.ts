import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscQueryIndexes1791127430930 implements MigrationInterface {
  name = 'AddDiscQueryIndexes1791127430930';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_rate_disc_id_d46" ON "rate" ("discId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_comment_disc_id_d46" ON "comment" ("discId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_rate_user_disc_d46" ON "rate" ("userId", "discId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_favorite_user_disc_d46" ON "favorite" ("userId", "discId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_pending_user_disc_d46" ON "pending" ("userId", "discId")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_pending_user_disc_d46"');
    await queryRunner.query('DROP INDEX "IDX_favorite_user_disc_d46"');
    await queryRunner.query('DROP INDEX "IDX_rate_user_disc_d46"');
    await queryRunner.query('DROP INDEX "IDX_comment_disc_id_d46"');
    await queryRunner.query('DROP INDEX "IDX_rate_disc_id_d46"');
  }
}
