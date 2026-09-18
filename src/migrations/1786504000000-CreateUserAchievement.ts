import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAchievement1786504000000 implements MigrationInterface {
  name = 'CreateUserAchievement1786504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_achievement" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "achievementId" uuid NOT NULL,
        "unlockedAt" TIMESTAMP,
        "progressValue" integer NOT NULL DEFAULT 0,
        "progressMeta" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_achievement_user_achievement" UNIQUE ("userId", "achievementId"),
        CONSTRAINT "PK_user_achievement" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `ALTER TABLE "user_achievement" ADD CONSTRAINT "FK_user_achievement_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_achievement" ADD CONSTRAINT "FK_user_achievement_achievement" FOREIGN KEY ("achievementId") REFERENCES "achievement"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_user_achievement_userId" ON "user_achievement" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_achievement_achievementId" ON "user_achievement" ("achievementId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_user_achievement_achievementId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_achievement_userId"`);
    await queryRunner.query(
      `ALTER TABLE "user_achievement" DROP CONSTRAINT "FK_user_achievement_achievement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_achievement" DROP CONSTRAINT "FK_user_achievement_user"`,
    );
    await queryRunner.query(`DROP TABLE "user_achievement"`);
  }
}
