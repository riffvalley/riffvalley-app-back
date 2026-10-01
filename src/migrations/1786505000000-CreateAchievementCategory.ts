import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAchievementCategory1786505000000 implements MigrationInterface {
  name = 'CreateAchievementCategory1786505000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "achievement_category" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "icon" text,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_achievement_category_code" UNIQUE ("code"),
        CONSTRAINT "PK_achievement_category" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "achievement_category"`);
  }
}
