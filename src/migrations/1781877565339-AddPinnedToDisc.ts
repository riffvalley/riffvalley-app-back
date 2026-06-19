import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPinnedToDisc1781877565339 implements MigrationInterface {
  name = 'AddPinnedToDisc1781877565339';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "disc" ADD "pinned" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "disc" DROP COLUMN "pinned"`);
  }
}
