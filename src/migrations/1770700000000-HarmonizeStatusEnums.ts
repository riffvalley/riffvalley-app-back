import { MigrationInterface, QueryRunner } from 'typeorm';

export class HarmonizeStatusEnums1770700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Update Spotify status enum
    // Convert to VARCHAR first, then map data, then create new enum
    await queryRunner.query(`ALTER TABLE "spotify" ALTER COLUMN "status" TYPE VARCHAR`);
    await queryRunner.query(`
      UPDATE "spotify" SET "status" = 'not_started' WHERE "status" = 'en_desarrollo';
    `);
    await queryRunner.query(`
      UPDATE "spotify" SET "status" = 'in_progress' WHERE "status" = 'por_actualizar';
    `);
    await queryRunner.query(`
      UPDATE "spotify" SET "status" = 'editing' WHERE "status" = 'actualizada';
    `);
    await queryRunner.query(`
      UPDATE "spotify" SET "status" = 'ready' WHERE "status" = 'para_publicar';
    `);
    await queryRunner.query(`
      UPDATE "spotify" SET "status" = 'published' WHERE "status" = 'publicada';
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."spotify_status_enum"`);
    await queryRunner.query(`CREATE TYPE "public"."spotify_status_enum" AS ENUM('not_started', 'in_progress', 'editing', 'ready', 'published')`);
    await queryRunner.query(`ALTER TABLE "spotify" ALTER COLUMN "status" TYPE "public"."spotify_status_enum" USING "status"::"public"."spotify_status_enum"`);

    // 2. Update Article status enum
    // Convert to VARCHAR first, then map data, then create new enum
    await queryRunner.query(`ALTER TABLE "article" ALTER COLUMN "status" TYPE VARCHAR`);
    await queryRunner.query(`
      UPDATE "article" SET "status" = 'in_progress' WHERE "status" = 'writing';
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."article_status_enum"`);
    await queryRunner.query(`CREATE TYPE "public"."article_status_enum" AS ENUM('not_started', 'in_progress', 'editing', 'ready', 'published')`);
    await queryRunner.query(`ALTER TABLE "article" ALTER COLUMN "status" TYPE "public"."article_status_enum" USING "status"::"public"."article_status_enum"`);

    // 3. Update List status enum - add new values
    await queryRunner.query(`ALTER TABLE "list" ALTER COLUMN "status" TYPE VARCHAR`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."list_status_enum"`);
    await queryRunner.query(`CREATE TYPE "public"."list_status_enum" AS ENUM('new', 'assigned', 'not_started', 'in_progress', 'editing', 'ready', 'published')`);
    await queryRunner.query(`ALTER TABLE "list" ALTER COLUMN "status" TYPE "public"."list_status_enum" USING "status"::"public"."list_status_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Revert List status enum
    await queryRunner.query(`ALTER TABLE "list" ALTER COLUMN "status" TYPE VARCHAR`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."list_status_enum"`);
    await queryRunner.query(`CREATE TYPE "public"."list_status_enum" AS ENUM('new', 'assigned', 'published')`);
    // Map new values back (best effort - data may be lost for new statuses)
    await queryRunner.query(`UPDATE "list" SET "status" = 'new' WHERE "status" IN ('not_started', 'in_progress', 'editing', 'ready')`);
    await queryRunner.query(`ALTER TABLE "list" ALTER COLUMN "status" TYPE "public"."list_status_enum" USING "status"::"public"."list_status_enum"`);

    // 2. Revert Article status enum
    await queryRunner.query(`UPDATE "article" SET "status" = 'writing' WHERE "status" = 'in_progress'`);
    await queryRunner.query(`ALTER TABLE "article" ALTER COLUMN "status" TYPE VARCHAR`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."article_status_enum"`);
    await queryRunner.query(`CREATE TYPE "public"."article_status_enum" AS ENUM('not_started', 'writing', 'editing', 'ready', 'published')`);
    await queryRunner.query(`ALTER TABLE "article" ALTER COLUMN "status" TYPE "public"."article_status_enum" USING "status"::"public"."article_status_enum"`);

    // 3. Revert Spotify status enum
    await queryRunner.query(`UPDATE "spotify" SET "status" = 'en_desarrollo' WHERE "status" = 'not_started'`);
    await queryRunner.query(`UPDATE "spotify" SET "status" = 'por_actualizar' WHERE "status" = 'in_progress'`);
    await queryRunner.query(`UPDATE "spotify" SET "status" = 'actualizada' WHERE "status" = 'editing'`);
    await queryRunner.query(`UPDATE "spotify" SET "status" = 'para_publicar' WHERE "status" = 'ready'`);
    await queryRunner.query(`UPDATE "spotify" SET "status" = 'publicada' WHERE "status" = 'published'`);
    await queryRunner.query(`ALTER TABLE "spotify" ALTER COLUMN "status" TYPE VARCHAR`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."spotify_status_enum"`);
    await queryRunner.query(`CREATE TYPE "public"."spotify_status_enum" AS ENUM('actualizada', 'publicada', 'para_publicar', 'por_actualizar', 'en_desarrollo')`);
    await queryRunner.query(`ALTER TABLE "spotify" ALTER COLUMN "status" TYPE "public"."spotify_status_enum" USING "status"::"public"."spotify_status_enum"`);
  }
}
