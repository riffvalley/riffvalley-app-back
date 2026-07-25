import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWpWeeklyPostsToList1784968448748 implements MigrationInterface {
  name = 'AddWpWeeklyPostsToList1784968448748';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "list" ADD "wpWeeklyPosts" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "list" DROP COLUMN "wpWeeklyPosts"`);
  }
}
