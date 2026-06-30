import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLocalizacionAndEvento1782824464152 implements MigrationInterface {
    name = 'AddLocalizacionAndEvento1782824464152'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."localizacion_type_enum" AS ENUM('venue', 'city')`);
        await queryRunner.query(`CREATE TABLE "localizacion" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "type" "public"."localizacion_type_enum" NOT NULL DEFAULT 'venue', "address" character varying(300), "city" character varying(100) NOT NULL, "countryId" uuid, "latitude" numeric(10,7), "longitude" numeric(10,7), CONSTRAINT "PK_489a237b2c032f755d40f9f24f7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."evento_type_enum" AS ENUM('concert', 'festival')`);
        await queryRunner.query(`CREATE TABLE "evento" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "type" "public"."evento_type_enum" NOT NULL DEFAULT 'concert', "startDate" date NOT NULL, "endDate" date, "price" numeric(10,2), "description" text, "image" text, "ticketLink" character varying(500), "localizacionId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ceb2e9607555230aee6aff546b0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "evento_artists" ("eventoId" uuid NOT NULL, "artistId" uuid NOT NULL, CONSTRAINT "PK_b2b98b3b73436d51bab880d142a" PRIMARY KEY ("eventoId", "artistId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_54f18cd4d0df6457b2ae3a93be" ON "evento_artists" ("eventoId") `);
        await queryRunner.query(`CREATE INDEX "IDX_be855fd485dc49cb291403b6fc" ON "evento_artists" ("artistId") `);
        await queryRunner.query(`ALTER TABLE "localizacion" ADD CONSTRAINT "FK_c318aebc810ada0a5ea57c7c1d2" FOREIGN KEY ("countryId") REFERENCES "country"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "evento" ADD CONSTRAINT "FK_6ee19e7b819a4d3fc77b100fc31" FOREIGN KEY ("localizacionId") REFERENCES "localizacion"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "evento_artists" ADD CONSTRAINT "FK_54f18cd4d0df6457b2ae3a93be7" FOREIGN KEY ("eventoId") REFERENCES "evento"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "evento_artists" ADD CONSTRAINT "FK_be855fd485dc49cb291403b6fcf" FOREIGN KEY ("artistId") REFERENCES "artist"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "evento_artists" DROP CONSTRAINT "FK_be855fd485dc49cb291403b6fcf"`);
        await queryRunner.query(`ALTER TABLE "evento_artists" DROP CONSTRAINT "FK_54f18cd4d0df6457b2ae3a93be7"`);
        await queryRunner.query(`ALTER TABLE "evento" DROP CONSTRAINT "FK_6ee19e7b819a4d3fc77b100fc31"`);
        await queryRunner.query(`ALTER TABLE "localizacion" DROP CONSTRAINT "FK_c318aebc810ada0a5ea57c7c1d2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_be855fd485dc49cb291403b6fc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_54f18cd4d0df6457b2ae3a93be"`);
        await queryRunner.query(`DROP TABLE "evento_artists"`);
        await queryRunner.query(`DROP TABLE "evento"`);
        await queryRunner.query(`DROP TYPE "public"."evento_type_enum"`);
        await queryRunner.query(`DROP TABLE "localizacion"`);
        await queryRunner.query(`DROP TYPE "public"."localizacion_type_enum"`);
    }

}
