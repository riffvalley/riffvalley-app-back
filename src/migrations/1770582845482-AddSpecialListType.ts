import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSpecialListType1770582845482 implements MigrationInterface {
    name = 'AddSpecialListType1770582845482'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."list_specialtype_enum" AS ENUM('web', 'app', 'noticias', 'videos', 'riffValley', 'otros')`);
        await queryRunner.query(`ALTER TABLE "list" ADD "specialType" "public"."list_specialtype_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "list" DROP COLUMN "specialType"`);
        await queryRunner.query(`DROP TYPE "public"."list_specialtype_enum"`);
    }

}
