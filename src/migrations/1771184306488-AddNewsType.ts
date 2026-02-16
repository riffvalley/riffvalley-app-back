import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNewsType1771184306488 implements MigrationInterface {
    name = 'AddNewsType1771184306488'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."news_type_enum" AS ENUM('version', 'new_feature', 'team_notes')`);
        await queryRunner.query(`ALTER TABLE "news" ADD "type" "public"."news_type_enum" NOT NULL DEFAULT 'new_feature'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."news_type_enum"`);
    }

}
