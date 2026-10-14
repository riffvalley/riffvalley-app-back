export const SPOTIFY_ALBUM_GROUPS = [
  'album',
  'single',
  'compilation',
  'appears_on',
] as const;

export type SpotifyAlbumGroup = (typeof SPOTIFY_ALBUM_GROUPS)[number];

/** Provider fields read by SpotifyPublicApiService. These are not API DTOs. */
export interface SpotifyApiImage {
  url?: string | null;
}

export interface SpotifyApiArtist {
  id: string;
  name: string;
  external_urls: { spotify: string };
  images?: SpotifyApiImage[] | null;
  genres?: unknown;
  followers?: { total?: unknown } | null;
  popularity?: unknown;
}

export interface SpotifyApiAlbum {
  id: string;
  name: string;
  album_type: string;
  release_date?: string | null;
  total_tracks?: number | null;
  external_urls: { spotify: string };
  images?: SpotifyApiImage[] | null;
  artists: SpotifyApiArtist[];
  tracks?: { items?: SpotifyApiAlbumTrack[] | null } | null;
}

export interface SpotifyApiAlbumTrack {
  id: string;
  name: string;
  track_number: number;
  duration_ms: number;
  preview_url?: string | null;
}

export interface SpotifyApiTrack extends SpotifyApiAlbumTrack {
  external_urls?: { spotify?: string | null } | null;
  album?: {
    name?: string | null;
    images?: SpotifyApiImage[] | null;
  } | null;
  popularity?: unknown;
}

export interface SpotifyClientCredentialsTokenResponse {
  access_token: string;
  expires_in: number;
}

export interface SpotifyApiSearchResponse<T> {
  artists?: { items?: T[] | null } | null;
  albums?: { items?: T[] | null } | null;
}

export interface SpotifyApiPage<T> {
  items?: T[] | null;
  next?: string | null;
}

export interface SpotifyApiTopTracksResponse {
  tracks?: SpotifyApiTrack[] | null;
}

export interface SpotifyApiTracksResponse {
  tracks?: Array<SpotifyApiTrack | null> | null;
}
