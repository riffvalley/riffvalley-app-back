import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTypeToSuggestion1774900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "suggestion_type_enum" AS ENUM ('suggestion', 'bug')
    `);
    await queryRunner.query(`
      ALTER TABLE "suggestion"
        ADD COLUMN "type" "suggestion_type_enum" NOT NULL DEFAULT 'suggestion'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "suggestion" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "suggestion_type_enum"`);
  }
}
