import { QueryRunner } from 'typeorm';
import { RenameRiffValleyPlaylistPersistence1791300000000 } from './1791300000000-RenameRiffValleyPlaylistPersistence';

describe('RenameRiffValleyPlaylistPersistence1791300000000', () => {
  const migration = new RenameRiffValleyPlaylistPersistence1791300000000();

  it('renames local persistence objects in place without changing data or ContentType', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) } as unknown as QueryRunner;

    await migration.up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.map(([query]) => query as string);
    expect(sql).toContain('ALTER TABLE "spotify" RENAME TO "riff_valley_playlists"');
    expect(sql).toContain(
      'ALTER TABLE "content" RENAME COLUMN "spotifyId" TO "riffValleyPlaylistId"',
    );
    expect(sql).toContain(
      'ALTER TABLE "spotify_playlist_artists" RENAME TO "riff_valley_playlist_artists"',
    );
    expect(sql).toContain(
      'ALTER TABLE "riff_valley_playlist_artists" RENAME COLUMN "spotify_id" TO "riff_valley_playlist_id"',
    );
    expect(sql).toContain(
      'ALTER TYPE "public"."spotify_status_enum" RENAME TO "riff_valley_playlist_status_enum"',
    );
    expect(sql).toContain(
      'ALTER TYPE "public"."spotify_type_enum" RENAME TO "riff_valley_playlist_type_enum"',
    );
    expect(sql.every((query) => /^ALTER (TABLE|INDEX|TYPE)/.test(query))).toBe(true);
    expect(sql.some((query) => query.includes('content_type_enum'))).toBe(false);
  });

  it('restores the legacy names in down', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) } as unknown as QueryRunner;

    await migration.down(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.map(([query]) => query as string);
    expect(sql).toContain(
      'ALTER TABLE "riff_valley_playlists" RENAME TO "spotify"',
    );
    expect(sql).toContain(
      'ALTER TABLE "content" RENAME COLUMN "riffValleyPlaylistId" TO "spotifyId"',
    );
    expect(sql).toContain(
      'ALTER TABLE "riff_valley_playlist_artists" RENAME TO "spotify_playlist_artists"',
    );
    expect(sql).toContain(
      'ALTER TABLE "riff_valley_playlist_artists" RENAME COLUMN "riff_valley_playlist_id" TO "spotify_id"',
    );
    expect(sql).toContain(
      'ALTER TYPE "public"."riff_valley_playlist_status_enum" RENAME TO "spotify_status_enum"',
    );
    expect(sql).toContain(
      'ALTER TYPE "public"."riff_valley_playlist_type_enum" RENAME TO "spotify_type_enum"',
    );
  });
});
