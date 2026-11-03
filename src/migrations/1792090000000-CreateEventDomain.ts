import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventDomain1792090000000 implements MigrationInterface {
  name = 'CreateEventDomain1792090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "venues" ADD "is_generic" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" ADD CONSTRAINT "CHK_venues_generic_without_physical_coordinates" CHECK (NOT "is_generic" OR ("latitude" IS NULL AND "longitude" IS NULL))`,
    );
    await queryRunner.query(`DROP INDEX "UQ_venues_locality_name_normalized"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_venues_locality_name_normalized" ON "venues" ("locality_id", "name_normalized") WHERE "is_generic" = false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_venues_generic_locality" ON "venues" ("locality_id") WHERE "is_generic" = true`,
    );
    await queryRunner.query(
      `CREATE TYPE "events_type_enum" AS ENUM ('concert', 'festival')`,
    );
    await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "events_type_enum" NOT NULL,
        "name" character varying(240),
        "start_date" date NOT NULL,
        "end_date" date,
        "venue_id" uuid NOT NULL,
        "price" text,
        "other_info" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_events_venue" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_events_end_date_not_before_start" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_events_start_date" ON "events" ("start_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_events_type_start_date" ON "events" ("type", "start_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_events_venue_start_date" ON "events" ("venue_id", "start_date")`,
    );
    await queryRunner.query(`
      CREATE TABLE "event_artists" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "event_id" uuid NOT NULL,
        "artist_id" uuid,
        "name" character varying(100) NOT NULL,
        "position" integer NOT NULL,
        CONSTRAINT "PK_event_artists" PRIMARY KEY ("id"),
        CONSTRAINT "FK_event_artists_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_event_artists_artist" FOREIGN KEY ("artist_id") REFERENCES "artist"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_event_artists_position_positive" CHECK ("position" >= 1),
        CONSTRAINT "CHK_event_artists_name_nonempty" CHECK (length(btrim("name")) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_event_artists_event_position" ON "event_artists" ("event_id", "position")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_event_artists_artist" ON "event_artists" ("artist_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_event_artists_artist"`);
    await queryRunner.query(`DROP INDEX "UQ_event_artists_event_position"`);
    await queryRunner.query(`DROP TABLE "event_artists"`);
    await queryRunner.query(`DROP INDEX "IDX_events_venue_start_date"`);
    await queryRunner.query(`DROP INDEX "IDX_events_type_start_date"`);
    await queryRunner.query(`DROP INDEX "IDX_events_start_date"`);
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TYPE "events_type_enum"`);
    await queryRunner.query(`DROP INDEX "UQ_venues_generic_locality"`);
    await queryRunner.query(`DROP INDEX "UQ_venues_locality_name_normalized"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_venues_locality_name_normalized" ON "venues" ("locality_id", "name_normalized")`,
    );
    await queryRunner.query(
      `ALTER TABLE "venues" DROP CONSTRAINT "CHK_venues_generic_without_physical_coordinates"`,
    );
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "is_generic"`);
  }
}
