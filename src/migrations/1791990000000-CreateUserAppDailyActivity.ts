import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAppDailyActivity1791990000000
  implements MigrationInterface
{
  name = 'CreateUserAppDailyActivity1791990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_app_daily_activity" (
        "user_id" uuid NOT NULL,
        "activity_date" date NOT NULL,
        CONSTRAINT "PK_user_app_daily_activity"
          PRIMARY KEY ("user_id", "activity_date"),
        CONSTRAINT "FK_user_app_daily_activity_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "user_app_daily_activity"');
  }
}
