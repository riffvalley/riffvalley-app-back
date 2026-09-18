import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAchievements1786503000000 implements MigrationInterface {
  name = 'CreateAchievements1786503000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."achievement_metrictype_enum" AS ENUM(
        'VOTE_STREAK',
        'DISTINCT_ARTISTS_IN_GENRE',
        'DISTINCT_GENRES',
        'DISTINCT_COUNTRIES',
        'TOTAL_VOTES',
        'TOTAL_COMMENTS',
        'TOTAL_FAVORITES',
        'CONTROVERSIAL_DISC_VOTE'
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "achievement" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" text NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "icon" text,
        "metricType" "public"."achievement_metrictype_enum" NOT NULL,
        "criteria" jsonb NOT NULL,
        "genreId" uuid,
        "points" integer NOT NULL DEFAULT 0,
        "secret" boolean NOT NULL DEFAULT false,
        "active" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_achievement_code" UNIQUE ("code"),
        CONSTRAINT "PK_achievement" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `ALTER TABLE "achievement" ADD CONSTRAINT "FK_achievement_genre" FOREIGN KEY ("genreId") REFERENCES "genre"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_achievement_genreId" ON "achievement" ("genreId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_achievement_metricType_active" ON "achievement" ("metricType", "active")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_achievement_metricType_active"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_achievement_genreId"`);
    await queryRunner.query(
      `ALTER TABLE "achievement" DROP CONSTRAINT "FK_achievement_genre"`,
    );
    await queryRunner.query(`DROP TABLE "achievement"`);
    await queryRunner.query(`DROP TYPE "public"."achievement_metrictype_enum"`);
  }
}
