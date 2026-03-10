import { MigrationInterface, QueryRunner } from "typeorm";

export class EnsureCoauthorOnArticle1773230000000 implements MigrationInterface {
    name = 'EnsureCoauthorOnArticle1773230000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "article"
            ADD COLUMN IF NOT EXISTS "coauthorId" uuid,
            ADD COLUMN IF NOT EXISTS "editorId" uuid
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "article" DROP COLUMN IF EXISTS "coauthorId"`);
        await queryRunner.query(`ALTER TABLE "article" DROP COLUMN IF EXISTS "editorId"`);
    }
}
