import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryToSuggestion1792060000000
  implements MigrationInterface
{
  name = 'AddCategoryToSuggestion1792060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "suggestion"
        ADD COLUMN "category" character varying(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "suggestion" DROP COLUMN "category"');
  }
}
