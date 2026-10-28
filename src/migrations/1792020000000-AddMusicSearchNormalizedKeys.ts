import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMusicSearchNormalizedKeys1792020000000
  implements MigrationInterface
{
  name = 'AddMusicSearchNormalizedKeys1792020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "artist" ADD COLUMN "search_name_normalized" text',
    );
    await queryRunner.query(
      'ALTER TABLE "disc" ADD COLUMN "search_name_normalized" text',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "disc" DROP COLUMN "search_name_normalized"',
    );
    await queryRunner.query(
      'ALTER TABLE "artist" DROP COLUMN "search_name_normalized"',
    );
  }
}
