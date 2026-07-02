import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLocationAndEvent1782985071057 implements MigrationInterface {
    name = 'AddLocationAndEvent1782985071057'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."location_type_enum" AS ENUM('venue', 'city')`);
        await queryRunner.query(`CREATE TABLE "location" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "type" "public"."location_type_enum" NOT NULL DEFAULT 'venue', "address" character varying(300), "city" character varying(100) NOT NULL, "countryId" uuid, "latitude" numeric(10,7), "longitude" numeric(10,7), "description" text, "images" text array, CONSTRAINT "PK_location" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."event_type_enum" AS ENUM('concert', 'festival')`);
        await queryRunner.query(`CREATE TABLE "event" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "type" "public"."event_type_enum" NOT NULL DEFAULT 'concert', "startDate" date NOT NULL, "endDate" date, "price" numeric(10,2), "description" text, "image" text, "ticketLink" character varying(500), "locationId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_event" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "event_artists" ("eventId" uuid NOT NULL, "artistId" uuid NOT NULL, CONSTRAINT "PK_event_artists" PRIMARY KEY ("eventId", "artistId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_event_artists_event" ON "event_artists" ("eventId") `);
        await queryRunner.query(`CREATE INDEX "IDX_event_artists_artist" ON "event_artists" ("artistId") `);
        await queryRunner.query(`ALTER TABLE "location" ADD CONSTRAINT "FK_location_country" FOREIGN KEY ("countryId") REFERENCES "country"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event" ADD CONSTRAINT "FK_event_location" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event_artists" ADD CONSTRAINT "FK_event_artists_event" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "event_artists" ADD CONSTRAINT "FK_event_artists_artist" FOREIGN KEY ("artistId") REFERENCES "artist"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "event_artists" DROP CONSTRAINT "FK_event_artists_artist"`);
        await queryRunner.query(`ALTER TABLE "event_artists" DROP CONSTRAINT "FK_event_artists_event"`);
        await queryRunner.query(`ALTER TABLE "event" DROP CONSTRAINT "FK_event_location"`);
        await queryRunner.query(`ALTER TABLE "location" DROP CONSTRAINT "FK_location_country"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_event_artists_artist"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_event_artists_event"`);
        await queryRunner.query(`DROP TABLE "event_artists"`);
        await queryRunner.query(`DROP TABLE "event"`);
        await queryRunner.query(`DROP TYPE "public"."event_type_enum"`);
        await queryRunner.query(`DROP TABLE "location"`);
        await queryRunner.query(`DROP TYPE "public"."location_type_enum"`);
    }

}
