import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWpTrackingToListAndAsignation1784921548462
  implements MigrationInterface
{
  name = 'AddWpTrackingToListAndAsignation1784921548462';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "list" ADD "wpPostId" integer`);
    await queryRunner.query(`ALTER TABLE "list" ADD "wpPostUrl" text`);
    await queryRunner.query(
      `ALTER TABLE "asignation" ADD "publishedToWp" boolean DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "asignation" DROP COLUMN "publishedToWp"`,
    );
    await queryRunner.query(`ALTER TABLE "list" DROP COLUMN "wpPostUrl"`);
    await queryRunner.query(`ALTER TABLE "list" DROP COLUMN "wpPostId"`);
  }
}
