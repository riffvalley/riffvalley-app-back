import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateNationalReleaseUniqueConstraintIncludeDiscType1781812928411 implements MigrationInterface {
  name = 'UpdateNationalReleaseUniqueConstraintIncludeDiscType1781812928411';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_national_release_artist_disc"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_national_release_artist_disc_type" ON "national_release" (LOWER("artistName"), LOWER("discName"), "discType")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_national_release_artist_disc_type"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_national_release_artist_disc" ON "national_release" (LOWER("artistName"), LOWER("discName"))`,
    );
  }
}
