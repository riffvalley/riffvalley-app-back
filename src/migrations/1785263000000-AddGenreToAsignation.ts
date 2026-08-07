import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGenreToAsignation1785263000000 implements MigrationInterface {
  name = 'AddGenreToAsignation1785263000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "asignation" ADD "genre" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "asignation" DROP COLUMN "genre"`);
  }
}
