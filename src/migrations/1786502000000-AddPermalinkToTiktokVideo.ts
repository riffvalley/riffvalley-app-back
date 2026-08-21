import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPermalinkToTiktokVideo1786502000000
  implements MigrationInterface
{
  name = 'AddPermalinkToTiktokVideo1786502000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tiktok_video" ADD "permalink" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tiktok_video" DROP COLUMN "permalink"`,
    );
  }
}
