import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDashboardConfigToUsers1784797636017
  implements MigrationInterface
{
  name = 'AddDashboardConfigToUsers1784797636017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "dashboardConfig" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "dashboardConfig"`);
  }
}
