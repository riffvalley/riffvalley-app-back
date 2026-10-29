import { MigrationInterface, QueryRunner } from 'typeorm';

export class UseClockTimestampForRateVoteEvents1792040000000
  implements MigrationInterface
{
  name = 'UseClockTimestampForRateVoteEvents1792040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rate_vote_events"
      ALTER COLUMN "occurred_at" SET DEFAULT clock_timestamp()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rate_vote_events"
      ALTER COLUMN "occurred_at" SET DEFAULT CURRENT_TIMESTAMP
    `);
  }
}
