export const SPOTIFY_ALBUM_GROUPS = [
  'album',
  'single',
  'compilation',
  'appears_on',
] as const;

export type SpotifyAlbumGroup = (typeof SPOTIFY_ALBUM_GROUPS)[number];
