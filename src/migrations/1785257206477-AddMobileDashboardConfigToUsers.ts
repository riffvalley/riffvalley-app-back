import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMobileDashboardConfigToUsers1785257206477
  implements MigrationInterface
{
  name = 'AddMobileDashboardConfigToUsers1785257206477';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "mobileDashboardConfig" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "mobileDashboardConfig"`,
    );
  }
}
