import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideoEntity1770800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(
      `CREATE TYPE "public"."video_status_enum" AS ENUM('not_started', 'in_progress', 'editing', 'ready', 'published')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."video_type_enum" AS ENUM('best', 'custom')`,
    );

    // Create video table
    await queryRunner.query(`
      CREATE TABLE "video" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(200) NOT NULL,
        "status" "public"."video_status_enum" NOT NULL,
        "link" character varying(500),
        "type" "public"."video_type_enum" NOT NULL,
        "fecha_actualizacion" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid,
        "editorId" uuid,
        "listId" uuid,
        CONSTRAINT "PK_video" PRIMARY KEY ("id"),
        CONSTRAINT "FK_video_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_video_editor" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_video_list" FOREIGN KEY ("listId") REFERENCES "list"("id") ON DELETE SET NULL
      )
    `);

    // Add videoId column to content table
    await queryRunner.query(`ALTER TABLE "content" ADD "videoId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "content" ADD CONSTRAINT "UQ_content_videoId" UNIQUE ("videoId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" ADD CONSTRAINT "FK_content_video" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove FK and column from content
    await queryRunner.query(
      `ALTER TABLE "content" DROP CONSTRAINT "FK_content_video"`,
    );
    await queryRunner.query(
      `ALTER TABLE "content" DROP CONSTRAINT "UQ_content_videoId"`,
    );
    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "videoId"`);

    // Drop video table
    await queryRunner.query(`DROP TABLE "video"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE "public"."video_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."video_status_enum"`);
  }
}
