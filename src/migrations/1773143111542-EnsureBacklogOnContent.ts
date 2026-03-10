import { MigrationInterface, QueryRunner } from "typeorm";

export class EnsureBacklogOnContent1773143111542 implements MigrationInterface {
    name = 'EnsureBacklogOnContent1773143111542'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "content"
            ADD COLUMN IF NOT EXISTS "backlog" boolean NOT NULL DEFAULT false
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "content" DROP COLUMN IF EXISTS "backlog"`);
    }
}
