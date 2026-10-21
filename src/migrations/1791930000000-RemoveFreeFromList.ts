import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveFreeFromList1791930000000 implements MigrationInterface {
  name = 'RemoveFreeFromList1791930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing free values are discarded by this operation. down() restores
    // the column definition, but cannot recover the historical values.
    await queryRunner.query(`ALTER TABLE "list" DROP COLUMN "free"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "list" ADD "free" boolean DEFAULT false`,
    );
  }
}
