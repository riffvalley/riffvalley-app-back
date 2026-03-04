import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateNationalRelease1772483400257 implements MigrationInterface {
    name = 'CreateNationalRelease1772483400257'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."national_release_disctype_enum" AS ENUM('single', 'ep', 'album')`);
        await queryRunner.query(`CREATE TABLE "national_release" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "artistName" character varying(100) NOT NULL, "discName" character varying(100) NOT NULL, "discType" "public"."national_release_disctype_enum" NOT NULL, "genre" character varying(100) NOT NULL, "releaseDay" date NOT NULL, "preview" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6e1223af477cfc852a6163b2eda" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "national_release"`);
        await queryRunner.query(`DROP TYPE "public"."national_release_disctype_enum"`);
    }

}
