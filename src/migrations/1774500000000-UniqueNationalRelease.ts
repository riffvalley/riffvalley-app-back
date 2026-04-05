import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniqueNationalRelease1774500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_national_release_artist_disc"
      ON "national_release" (LOWER("artistName"), LOWER("discName"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_national_release_artist_disc"`);
  }
}
