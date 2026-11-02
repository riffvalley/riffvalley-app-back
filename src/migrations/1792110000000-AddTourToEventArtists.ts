import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTourToEventArtists1792110000000 implements MigrationInterface {
  name = 'AddTourToEventArtists1792110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "event_artists" ADD "tour_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "event_artists" ADD CONSTRAINT "FK_event_artists_tour" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_event_artists_tour_event_position" ON "event_artists" ("tour_id", "event_id", "position") WHERE "tour_id" IS NOT NULL`,
    );
    await queryRunner.query(`
      CREATE FUNCTION enforce_event_artist_tour_festival() RETURNS trigger AS $$
      DECLARE event_type "events_type_enum";
      BEGIN
        IF NEW.tour_id IS NULL THEN
          RETURN NEW;
        END IF;
        SELECT type INTO event_type FROM events WHERE id = NEW.event_id FOR UPDATE;
        IF event_type IS DISTINCT FROM 'festival'::"events_type_enum" THEN
          RAISE EXCEPTION 'EventArtist tour associations require a festival event'
            USING ERRCODE = '23514', CONSTRAINT = 'CHK_event_artists_tour_is_festival';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_event_artists_tour_festival"
      BEFORE INSERT OR UPDATE OF "event_id", "tour_id" ON "event_artists"
      FOR EACH ROW EXECUTE FUNCTION enforce_event_artist_tour_festival()
    `);
    await queryRunner.query(`
      CREATE FUNCTION prevent_event_type_with_incompatible_tours() RETURNS trigger AS $$
      BEGIN
        IF NEW.type <> 'festival'::"events_type_enum"
          AND EXISTS (SELECT 1 FROM event_artists WHERE event_id = NEW.id AND tour_id IS NOT NULL) THEN
          RAISE EXCEPTION 'Remove festival performance tour associations before changing the event type'
            USING ERRCODE = '23514', CONSTRAINT = 'CHK_event_artists_tour_is_festival';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_events_type_festival_tour_associations"
      BEFORE UPDATE OF "type" ON "events"
      FOR EACH ROW EXECUTE FUNCTION prevent_event_type_with_incompatible_tours()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_events_type_festival_tour_associations" ON "events"`,
    );
    await queryRunner.query(
      `DROP FUNCTION prevent_event_type_with_incompatible_tours()`,
    );
    await queryRunner.query(
      `DROP TRIGGER "TRG_event_artists_tour_festival" ON "event_artists"`,
    );
    await queryRunner.query(
      `DROP FUNCTION enforce_event_artist_tour_festival()`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_event_artists_tour_event_position"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_artists" DROP CONSTRAINT "FK_event_artists_tour"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_artists" DROP COLUMN "tour_id"`,
    );
  }
}
