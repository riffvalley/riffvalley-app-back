import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstagramPost1785258000000 implements MigrationInterface {
  name = 'CreateInstagramPost1785258000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."instagram_post_mediatype_enum" AS ENUM('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')`,
    );
    await queryRunner.query(
      `CREATE TABLE "instagram_post" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "igMediaId" character varying(100) NOT NULL,
        "caption" text,
        "mediaType" "public"."instagram_post_mediatype_enum" NOT NULL,
        "mediaUrl" text NOT NULL,
        "thumbnailUrl" text,
        "permalink" text NOT NULL,
        "igTimestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_instagram_post_igMediaId" UNIQUE ("igMediaId"),
        CONSTRAINT "PK_instagram_post" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "instagram_post"`);
    await queryRunner.query(`DROP TYPE "public"."instagram_post_mediatype_enum"`);
  }
}
