import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPublishAtToNationalRelease1772484992228 implements MigrationInterface {
    name = 'AddPublishAtToNationalRelease1772484992228'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "national_release" ADD COLUMN "publishAt" date`);
        await queryRunner.query(`ALTER TABLE "national_release" DROP COLUMN "preview"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "national_release" ADD COLUMN "preview" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "national_release" DROP COLUMN "publishAt"`);
    }

}
