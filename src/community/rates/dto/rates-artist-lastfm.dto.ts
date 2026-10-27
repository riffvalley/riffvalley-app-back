export type RatesArtistLastfmStatus =
  | 'available'
  | 'not_found'
  | 'unavailable'
  | 'not_configured'
  | 'invalid_response';

export interface RatesArtistLastfmLinkDto {
  name: string;
  url: string | null;
}

export interface RatesArtistLastfmResponseDto {
  artistId: string;
  status: RatesArtistLastfmStatus;
  biography: { summary: string | null; url: string | null } | null;
  tags: RatesArtistLastfmLinkDto[];
  similarArtists: RatesArtistLastfmLinkDto[];
  listeners: number | null;
  playCount: number | null;
  lastfmUrl: string | null;
}
