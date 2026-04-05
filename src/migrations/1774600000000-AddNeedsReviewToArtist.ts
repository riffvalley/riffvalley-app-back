import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNeedsReviewToArtist1774600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "artist"
      ADD COLUMN "needsReview" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "artist" DROP COLUMN "needsReview"`);
  }
}
