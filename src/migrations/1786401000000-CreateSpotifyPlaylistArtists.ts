import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSpotifyPlaylistArtists1786401000000
  implements MigrationInterface
{
  name = 'CreateSpotifyPlaylistArtists1786401000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spotify" ADD "spotify_playlist_id" character varying(100)`,
    );
    await queryRunner.query(`ALTER TABLE "spotify" ADD "description" text`);
    await queryRunner.query(
      `ALTER TABLE "spotify" ADD "is_public" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "spotify" ADD CONSTRAINT "UQ_spotify_playlist_id" UNIQUE ("spotify_playlist_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "spotify_playlist_artists" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "spotify_id" uuid NOT NULL,
        "artist_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL,
        "setlists_analyzed" integer NOT NULL DEFAULT 0,
        "tracks" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_spotify_playlist_artists" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_spotify_playlist_artist" UNIQUE ("spotify_id", "artist_id"),
        CONSTRAINT "FK_spotify_playlist_artists_spotify"
          FOREIGN KEY ("spotify_id") REFERENCES "spotify"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_spotify_playlist_artists_artist"
          FOREIGN KEY ("artist_id") REFERENCES "artist"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_spotify_playlist_artists_artist" ON "spotify_playlist_artists" ("artist_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_spotify_playlist_artists_artist"`);
    await queryRunner.query(`DROP TABLE "spotify_playlist_artists"`);
    await queryRunner.query(
      `ALTER TABLE "spotify" DROP CONSTRAINT "UQ_spotify_playlist_id"`,
    );
    await queryRunner.query(`ALTER TABLE "spotify" DROP COLUMN "is_public"`);
    await queryRunner.query(`ALTER TABLE "spotify" DROP COLUMN "description"`);
    await queryRunner.query(
      `ALTER TABLE "spotify" DROP COLUMN "spotify_playlist_id"`,
    );
  }
}
