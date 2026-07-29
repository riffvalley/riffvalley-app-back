import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaProductTypeToInstagramPost1785259000000
  implements MigrationInterface
{
  name = 'AddMediaProductTypeToInstagramPost1785259000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instagram_post" ADD "mediaProductType" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instagram_post" DROP COLUMN "mediaProductType"`,
    );
  }
}
