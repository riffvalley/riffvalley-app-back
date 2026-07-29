import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChildrenToInstagramPost1785260000000
  implements MigrationInterface
{
  name = 'AddChildrenToInstagramPost1785260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instagram_post" ADD "children" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instagram_post" DROP COLUMN "children"`,
    );
  }
}
