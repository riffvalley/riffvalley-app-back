import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTours1792100000000 implements MigrationInterface {
  name = 'CreateTours1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tours" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(180) NOT NULL,
        "description" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tours" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`ALTER TABLE "events" ADD "tour_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "events" ADD CONSTRAINT "FK_events_tour" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD CONSTRAINT "CHK_events_tour_is_concert" CHECK ("tour_id" IS NULL OR "type" = 'concert')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_events_tour_start_date" ON "events" ("tour_id", "start_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_events_tour_start_date"`);
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "CHK_events_tour_is_concert"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "FK_events_tour"`,
    );
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "tour_id"`);
    await queryRunner.query(`DROP TABLE "tours"`);
  }
}
