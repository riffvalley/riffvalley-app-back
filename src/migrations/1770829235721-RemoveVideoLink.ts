import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveVideoLink1770829235721 implements MigrationInterface {
    name = 'RemoveVideoLink1770829235721'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "content" DROP CONSTRAINT "FK_content_video"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_video_list"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_video_editor"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_video_user"`);
        await queryRunner.query(`ALTER TABLE "video" DROP COLUMN "link"`);
        await queryRunner.query(`ALTER TABLE "content" ADD CONSTRAINT "FK_65caa7c88673d6c0cf1454e99e4" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_74e27b13f8ac66f999400df12f6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_326eb34c48fc181639511958a19" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_e7181db8200f878e3ba5fb2486c" FOREIGN KEY ("listId") REFERENCES "list"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_e7181db8200f878e3ba5fb2486c"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_326eb34c48fc181639511958a19"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_74e27b13f8ac66f999400df12f6"`);
        await queryRunner.query(`ALTER TABLE "content" DROP CONSTRAINT "FK_65caa7c88673d6c0cf1454e99e4"`);
        await queryRunner.query(`ALTER TABLE "video" ADD "link" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_video_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_video_editor" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_video_list" FOREIGN KEY ("listId") REFERENCES "list"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "content" ADD CONSTRAINT "FK_content_video" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
