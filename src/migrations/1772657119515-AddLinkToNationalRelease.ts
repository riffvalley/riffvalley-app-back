import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLinkToNationalRelease1772657119515 implements MigrationInterface {
    name = 'AddLinkToNationalRelease1772657119515'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rate" DROP CONSTRAINT "FK_7440b44c5acbec8b2ebfc3af7d2"`);
        await queryRunner.query(`ALTER TABLE "favorite" DROP CONSTRAINT "FK_83b775fdebbe24c29b2b5831f2d"`);
        await queryRunner.query(`ALTER TABLE "pending" DROP CONSTRAINT "FK_8ecbb91a2562c5efed9447b80f8"`);
        await queryRunner.query(`ALTER TABLE "comment" DROP CONSTRAINT "FK_e3aebe2bd1c53467a07109be596"`);
        await queryRunner.query(`ALTER TABLE "comment" DROP CONSTRAINT "FK_c0354a9a009d3bb45a08655ce3b"`);
        await queryRunner.query(`ALTER TABLE "asignation" DROP CONSTRAINT "FK_9d41fe509640ba0c786b5daf75d"`);
        await queryRunner.query(`ALTER TABLE "spotify" DROP CONSTRAINT "FK_c95472afea04c05258cd3ce595d"`);
        await queryRunner.query(`ALTER TABLE "article" DROP CONSTRAINT "FK_29740ddc0b7f0af9ed816db0f7a"`);
        await queryRunner.query(`ALTER TABLE "article" DROP CONSTRAINT "FK_021ce4f1155af87f1a27d9ec54a"`);
        await queryRunner.query(`ALTER TABLE "article" DROP CONSTRAINT "FK_636f17dadfea1ffb4a412296a28"`);
        await queryRunner.query(`ALTER TABLE "content" DROP CONSTRAINT "FK_93951308013e484eb6ab7888a1b"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_326eb34c48fc181639511958a19"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_74e27b13f8ac66f999400df12f6"`);
        await queryRunner.query(`ALTER TABLE "version_item" DROP CONSTRAINT "FK_780bbdaa14c5bfe494e5ae6e829"`);
        await queryRunner.query(`ALTER TABLE "version_item" DROP CONSTRAINT "FK_e8e898664f4b65d12587c87c8da"`);
        await queryRunner.query(`ALTER TABLE "article" DROP COLUMN "coauthorId"`);
        await queryRunner.query(`ALTER TABLE "content" DROP COLUMN "backlog"`);
        await queryRunner.query(`ALTER TABLE "national_release" ADD "link" character varying(500)`);
        await queryRunner.query(`ALTER TABLE "rate" ADD CONSTRAINT "FK_7440b44c5acbec8b2ebfc3af7d2" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "favorite" ADD CONSTRAINT "FK_83b775fdebbe24c29b2b5831f2d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "pending" ADD CONSTRAINT "FK_8ecbb91a2562c5efed9447b80f8" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comment" ADD CONSTRAINT "FK_c0354a9a009d3bb45a08655ce3b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comment" ADD CONSTRAINT "FK_e3aebe2bd1c53467a07109be596" FOREIGN KEY ("parentId") REFERENCES "comment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "asignation" ADD CONSTRAINT "FK_9d41fe509640ba0c786b5daf75d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "spotify" ADD CONSTRAINT "FK_c95472afea04c05258cd3ce595d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "article" ADD CONSTRAINT "FK_636f17dadfea1ffb4a412296a28" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "article" ADD CONSTRAINT "FK_021ce4f1155af87f1a27d9ec54a" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "content" ADD CONSTRAINT "FK_93951308013e484eb6ab7888a1b" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_74e27b13f8ac66f999400df12f6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_326eb34c48fc181639511958a19" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "version_item" ADD CONSTRAINT "FK_e8e898664f4b65d12587c87c8da" FOREIGN KEY ("backUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "version_item" ADD CONSTRAINT "FK_780bbdaa14c5bfe494e5ae6e829" FOREIGN KEY ("frontUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "version_item" DROP CONSTRAINT "FK_780bbdaa14c5bfe494e5ae6e829"`);
        await queryRunner.query(`ALTER TABLE "version_item" DROP CONSTRAINT "FK_e8e898664f4b65d12587c87c8da"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_326eb34c48fc181639511958a19"`);
        await queryRunner.query(`ALTER TABLE "video" DROP CONSTRAINT "FK_74e27b13f8ac66f999400df12f6"`);
        await queryRunner.query(`ALTER TABLE "content" DROP CONSTRAINT "FK_93951308013e484eb6ab7888a1b"`);
        await queryRunner.query(`ALTER TABLE "article" DROP CONSTRAINT "FK_021ce4f1155af87f1a27d9ec54a"`);
        await queryRunner.query(`ALTER TABLE "article" DROP CONSTRAINT "FK_636f17dadfea1ffb4a412296a28"`);
        await queryRunner.query(`ALTER TABLE "spotify" DROP CONSTRAINT "FK_c95472afea04c05258cd3ce595d"`);
        await queryRunner.query(`ALTER TABLE "asignation" DROP CONSTRAINT "FK_9d41fe509640ba0c786b5daf75d"`);
        await queryRunner.query(`ALTER TABLE "comment" DROP CONSTRAINT "FK_e3aebe2bd1c53467a07109be596"`);
        await queryRunner.query(`ALTER TABLE "comment" DROP CONSTRAINT "FK_c0354a9a009d3bb45a08655ce3b"`);
        await queryRunner.query(`ALTER TABLE "pending" DROP CONSTRAINT "FK_8ecbb91a2562c5efed9447b80f8"`);
        await queryRunner.query(`ALTER TABLE "favorite" DROP CONSTRAINT "FK_83b775fdebbe24c29b2b5831f2d"`);
        await queryRunner.query(`ALTER TABLE "rate" DROP CONSTRAINT "FK_7440b44c5acbec8b2ebfc3af7d2"`);
        await queryRunner.query(`ALTER TABLE "national_release" DROP COLUMN "link"`);
        await queryRunner.query(`ALTER TABLE "content" ADD "backlog" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "article" ADD "coauthorId" uuid`);
        await queryRunner.query(`ALTER TABLE "version_item" ADD CONSTRAINT "FK_e8e898664f4b65d12587c87c8da" FOREIGN KEY ("backUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "version_item" ADD CONSTRAINT "FK_780bbdaa14c5bfe494e5ae6e829" FOREIGN KEY ("frontUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_74e27b13f8ac66f999400df12f6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "video" ADD CONSTRAINT "FK_326eb34c48fc181639511958a19" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "content" ADD CONSTRAINT "FK_93951308013e484eb6ab7888a1b" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "article" ADD CONSTRAINT "FK_636f17dadfea1ffb4a412296a28" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "article" ADD CONSTRAINT "FK_021ce4f1155af87f1a27d9ec54a" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "article" ADD CONSTRAINT "FK_29740ddc0b7f0af9ed816db0f7a" FOREIGN KEY ("coauthorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "spotify" ADD CONSTRAINT "FK_c95472afea04c05258cd3ce595d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "asignation" ADD CONSTRAINT "FK_9d41fe509640ba0c786b5daf75d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comment" ADD CONSTRAINT "FK_c0354a9a009d3bb45a08655ce3b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comment" ADD CONSTRAINT "FK_e3aebe2bd1c53467a07109be596" FOREIGN KEY ("parentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "pending" ADD CONSTRAINT "FK_8ecbb91a2562c5efed9447b80f8" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "favorite" ADD CONSTRAINT "FK_83b775fdebbe24c29b2b5831f2d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rate" ADD CONSTRAINT "FK_7440b44c5acbec8b2ebfc3af7d2" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
