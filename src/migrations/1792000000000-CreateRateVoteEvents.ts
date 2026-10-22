import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRateVoteEvents1792000000000 implements MigrationInterface {
  name = 'CreateRateVoteEvents1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rate_vote_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "event_type" character varying(16) NOT NULL,
        CONSTRAINT "PK_rate_vote_events" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_rate_vote_events_type"
          CHECK ("event_type" IN ('set', 'change')),
        CONSTRAINT "FK_rate_vote_events_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_rate_vote_events_user_occurred_at"
      ON "rate_vote_events" ("user_id", "occurred_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_rate_vote_events_occurred_at"
      ON "rate_vote_events" ("occurred_at")
    `);
    await queryRunner.query(`
      CREATE TABLE "rate_vote_event_capture" (
        "id" smallint NOT NULL,
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT "PK_rate_vote_event_capture" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_rate_vote_event_capture_singleton" CHECK ("id" = 1)
      )
    `);
    await queryRunner.query(
      'INSERT INTO "rate_vote_event_capture" ("id") VALUES (1)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "rate_vote_event_capture"');
    await queryRunner.query('DROP INDEX "IDX_rate_vote_events_occurred_at"');
    await queryRunner.query(
      'DROP INDEX "IDX_rate_vote_events_user_occurred_at"',
    );
    await queryRunner.query('DROP TABLE "rate_vote_events"');
  }
}
