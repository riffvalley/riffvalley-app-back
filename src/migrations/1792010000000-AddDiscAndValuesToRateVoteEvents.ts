import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscAndValuesToRateVoteEvents1792010000000
  implements MigrationInterface
{
  name = 'AddDiscAndValuesToRateVoteEvents1792010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "rate_vote_events" ADD COLUMN "disc_id" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "rate_vote_events" ADD COLUMN "previous_value" decimal(4,2)',
    );
    await queryRunner.query(
      'ALTER TABLE "rate_vote_events" ADD COLUMN "new_value" decimal(4,2)',
    );
    await queryRunner.query(`
      ALTER TABLE "rate_vote_events"
      ADD CONSTRAINT "FK_rate_vote_events_disc"
      FOREIGN KEY ("disc_id") REFERENCES "disc"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "rate_vote_events" DROP CONSTRAINT "FK_rate_vote_events_disc"',
    );
    await queryRunner.query(
      'ALTER TABLE "rate_vote_events" DROP COLUMN "new_value"',
    );
    await queryRunner.query(
      'ALTER TABLE "rate_vote_events" DROP COLUMN "previous_value"',
    );
    await queryRunner.query(
      'ALTER TABLE "rate_vote_events" DROP COLUMN "disc_id"',
    );
  }
}
