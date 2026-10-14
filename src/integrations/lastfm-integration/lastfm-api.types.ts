export interface LastfmArtistResponse {
  artist?: object;
  error?: number;
  message?: string;
}

export interface LastfmAlbumResponse {
  error?: number;
  album?: {
    image?: { '#text': string; size: string }[];
  };
}
