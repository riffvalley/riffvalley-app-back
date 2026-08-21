import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTiktokVideo1786501000000 implements MigrationInterface {
  name = 'CreateTiktokVideo1786501000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tiktok_video" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tiktokVideoId" character varying(100) NOT NULL,
        "title" text,
        "videoDescription" text,
        "coverImageUrl" text,
        "embedLink" text,
        "embedHtml" text,
        "duration" integer,
        "viewCount" integer,
        "likeCount" integer,
        "commentCount" integer,
        "shareCount" integer,
        "tiktokCreateTime" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_tiktok_video_tiktokVideoId" UNIQUE ("tiktokVideoId"),
        CONSTRAINT "PK_tiktok_video" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tiktok_video"`);
  }
}
