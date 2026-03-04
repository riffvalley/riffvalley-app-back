import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDiscRequest1772268446913 implements MigrationInterface {
    name = 'CreateDiscRequest1772268446913'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_access_log" DROP CONSTRAINT "FK_user_access_log_user"`);
        await queryRunner.query(`CREATE TYPE "public"."disc_request_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "disc_request" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "discName" character varying(100) NOT NULL, "artistName" character varying(100) NOT NULL, "releaseDate" date, "ep" boolean NOT NULL DEFAULT false, "debut" boolean NOT NULL DEFAULT false, "description" text, "image" text, "link" character varying(255), "status" "public"."disc_request_status_enum" NOT NULL DEFAULT 'pending', "adminNotes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, "genreId" uuid, "countryId" uuid, CONSTRAINT "PK_8d2d26c9bd7469684fbc3236f25" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "disc_request" ADD CONSTRAINT "FK_b123f57529abf2fbe8eb7350b67" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "disc_request" ADD CONSTRAINT "FK_de30e18ab71f087652d99d25139" FOREIGN KEY ("genreId") REFERENCES "genre"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "disc_request" ADD CONSTRAINT "FK_271cb4be7f3f12fc1d598a508d1" FOREIGN KEY ("countryId") REFERENCES "country"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_access_log" ADD CONSTRAINT "FK_98cffc45b7b918d4e7ef3b4803b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_access_log" DROP CONSTRAINT "FK_98cffc45b7b918d4e7ef3b4803b"`);
        await queryRunner.query(`ALTER TABLE "disc_request" DROP CONSTRAINT "FK_271cb4be7f3f12fc1d598a508d1"`);
        await queryRunner.query(`ALTER TABLE "disc_request" DROP CONSTRAINT "FK_de30e18ab71f087652d99d25139"`);
        await queryRunner.query(`ALTER TABLE "disc_request" DROP CONSTRAINT "FK_b123f57529abf2fbe8eb7350b67"`);
        await queryRunner.query(`DROP TABLE "disc_request"`);
        await queryRunner.query(`DROP TYPE "public"."disc_request_status_enum"`);
        await queryRunner.query(`ALTER TABLE "user_access_log" ADD CONSTRAINT "FK_user_access_log_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
