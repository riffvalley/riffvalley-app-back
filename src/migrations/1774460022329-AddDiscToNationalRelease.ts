import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDiscToNationalRelease1774460022329 implements MigrationInterface {
    name = 'AddDiscToNationalRelease1774460022329'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "national_release" ADD "discId" uuid`);
        await queryRunner.query(`ALTER TABLE "national_release" ADD CONSTRAINT "FK_30da3b188d7eec52fe9ad935e44" FOREIGN KEY ("discId") REFERENCES "disc"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "national_release" DROP CONSTRAINT "FK_30da3b188d7eec52fe9ad935e44"`);
        await queryRunner.query(`ALTER TABLE "national_release" DROP COLUMN "discId"`);
    }

}
