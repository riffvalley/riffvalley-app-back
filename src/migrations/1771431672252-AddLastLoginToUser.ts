import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastLoginToUser1771431672252 implements MigrationInterface {
    name = 'AddLastLoginToUser1771431672252'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "lastLogin" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "news" ALTER COLUMN "type" DROP DEFAULT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news" ALTER COLUMN "type" SET DEFAULT 'new_feature'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLogin"`);
    }

}
