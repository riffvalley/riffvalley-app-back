import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAccessLog1771500000000 implements MigrationInterface {
  name = 'CreateUserAccessLog1771500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_access_log" (
        "userId" uuid NOT NULL,
        "date"   date NOT NULL,
        CONSTRAINT "PK_user_access_log" PRIMARY KEY ("userId", "date"),
        CONSTRAINT "FK_user_access_log_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_access_log"`);
  }
}
