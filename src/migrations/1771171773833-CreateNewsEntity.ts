import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNewsEntity1771171773833 implements MigrationInterface {
    name = 'CreateNewsEntity1771171773833'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."news_status_enum" AS ENUM('draft', 'published')`);
        await queryRunner.query(`CREATE TABLE "news" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(200) NOT NULL, "body" text NOT NULL, "image" text, "publishDate" date, "status" "public"."news_status_enum" NOT NULL DEFAULT 'draft', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_39a43dfcb6007180f04aff2357e" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "news"`);
        await queryRunner.query(`DROP TYPE "public"."news_status_enum"`);
    }

}
