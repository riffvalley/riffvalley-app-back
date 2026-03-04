import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCoauthorToArticle1772644747040 implements MigrationInterface {
    name = 'AddCoauthorToArticle1772644747040'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "article" ADD "coauthorId" uuid`);
        await queryRunner.query(`ALTER TABLE "article" ADD CONSTRAINT "FK_29740ddc0b7f0af9ed816db0f7a" FOREIGN KEY ("coauthorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "article" DROP CONSTRAINT "FK_29740ddc0b7f0af9ed816db0f7a"`);
        await queryRunner.query(`ALTER TABLE "article" DROP COLUMN "coauthorId"`);
    }

}
