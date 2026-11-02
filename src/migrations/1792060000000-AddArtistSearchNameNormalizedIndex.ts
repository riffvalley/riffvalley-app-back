import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArtistSearchNameNormalizedIndex1792060000000
  implements MigrationInterface
{
  name = 'AddArtistSearchNameNormalizedIndex1792060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "IDX_artist_search_name_normalized" ON "artist" ("search_name_normalized") WHERE "search_name_normalized" IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_artist_search_name_normalized"');
  }
}
