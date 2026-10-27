export interface LastfmArtistResponse {
  artist?: object;
  error?: number;
  message?: string;
}

export interface LastfmArtistProfile {
  name: string;
  url: string | null;
  biographySummary: string | null;
  biographyUrl: string | null;
  tags: Array<{ name: string; url: string | null }>;
  similarArtists: Array<{ name: string; url: string | null }>;
  listeners: string | null;
  playCount: string | null;
}

export type LastfmArtistProfileLookup =
  | { status: 'found'; profile: LastfmArtistProfile }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'not_configured' }
  | { status: 'invalid_response' };

export interface LastfmAlbumResponse {
  error?: number;
  album?: {
    image?: { '#text': string; size: string }[];
  };
}
