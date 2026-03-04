import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBacklogToContent1772642717355 implements MigrationInterface {
    name = 'AddBacklogToContent1772642717355'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "content" ADD "backlog" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "backlog"`);
    }

}
