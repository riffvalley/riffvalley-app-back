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

export interface RatesArtistLastfmCatalogDiscDto {
  id: string;
  name: string;
  image: string | null;
  releaseYear: number | null;
}

export interface RatesArtistLastfmSimilarArtistDto
  extends RatesArtistLastfmLinkDto {
  catalogArtistId: string | null;
  catalogDiscCount: number;
  catalogDiscs: RatesArtistLastfmCatalogDiscDto[];
}

export interface RatesArtistLastfmResponseDto {
  artistId: string;
  status: RatesArtistLastfmStatus;
  biography: { summary: string | null; url: string | null } | null;
  tags: RatesArtistLastfmLinkDto[];
  similarArtists: RatesArtistLastfmSimilarArtistDto[];
  listeners: number | null;
  playCount: number | null;
  lastfmUrl: string | null;
}
