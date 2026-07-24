import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplacePublishedToWpWithListTracking1784923284223
  implements MigrationInterface
{
  name = 'ReplacePublishedToWpWithListTracking1784923284223';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "asignation" DROP COLUMN "publishedToWp"`,
    );
    await queryRunner.query(`ALTER TABLE "list" ADD "wpPublishedDiscs" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "list" DROP COLUMN "wpPublishedDiscs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "asignation" ADD "publishedToWp" boolean DEFAULT false`,
    );
  }
}
