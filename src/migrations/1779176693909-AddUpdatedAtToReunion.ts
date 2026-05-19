import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUpdatedAtToReunion1779176693909 implements MigrationInterface {
    name = 'AddUpdatedAtToReunion1779176693909'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reunions" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "reunions" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "reunions" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reunions" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "reunions" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "reunions" ADD "createdAt" date`);
    }

}
