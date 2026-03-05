import { MigrationInterface, QueryRunner } from "typeorm";

export class AddApprovedToNationalRelease1772695524635 implements MigrationInterface {
    name = 'AddApprovedToNationalRelease1772695524635'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "national_release" ADD "approved" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "national_release" DROP COLUMN "approved"`);
    }

}
