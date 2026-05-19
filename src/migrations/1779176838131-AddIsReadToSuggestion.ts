import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsReadToSuggestion1779176838131 implements MigrationInterface {
    name = 'AddIsReadToSuggestion1779176838131'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suggestion" ADD "isRead" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suggestion" DROP COLUMN "isRead"`);
    }

}
