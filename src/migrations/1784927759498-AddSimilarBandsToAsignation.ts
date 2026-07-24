import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSimilarBandsToAsignation1784927759498
  implements MigrationInterface
{
  name = 'AddSimilarBandsToAsignation1784927759498';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "asignation" ADD "similarBands" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "asignation" DROP COLUMN "similarBands"`,
    );
  }
}
