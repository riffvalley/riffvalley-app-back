import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeInstagramPostMediaUrlNullable1785261000000
  implements MigrationInterface
{
  name = 'MakeInstagramPostMediaUrlNullable1785261000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instagram_post" ALTER COLUMN "mediaUrl" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "instagram_post" SET "mediaUrl" = NULL WHERE "mediaUrl" = ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "instagram_post" SET "mediaUrl" = '' WHERE "mediaUrl" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "instagram_post" ALTER COLUMN "mediaUrl" SET NOT NULL`,
    );
  }
}
