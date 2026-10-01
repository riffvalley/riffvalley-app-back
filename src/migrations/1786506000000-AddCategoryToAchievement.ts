import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryToAchievement1786506000000 implements MigrationInterface {
  name = 'AddCategoryToAchievement1786506000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable a nivel de BD (defensivo ante filas ya existentes en algún
    // entorno); la obligatoriedad real para logros nuevos vive en
    // CreateAchievementDto. RESTRICT: una categoría con logros no puede borrarse.
    await queryRunner.query(
      `ALTER TABLE "achievement" ADD "categoryId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "achievement" ADD CONSTRAINT "FK_achievement_category" FOREIGN KEY ("categoryId") REFERENCES "achievement_category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_achievement_categoryId" ON "achievement" ("categoryId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_achievement_categoryId"`);
    await queryRunner.query(
      `ALTER TABLE "achievement" DROP CONSTRAINT "FK_achievement_category"`,
    );
    await queryRunner.query(`ALTER TABLE "achievement" DROP COLUMN "categoryId"`);
  }
}
