import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDashboardButtonsEnabledToUsers1786507000000
  implements MigrationInterface
{
  name = 'AddDashboardButtonsEnabledToUsers1786507000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "dashboardButtonsEnabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "dashboardButtonsEnabled"`,
    );
  }
}
