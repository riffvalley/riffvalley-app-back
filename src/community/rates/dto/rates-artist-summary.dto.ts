export interface RatesArtistSummaryGenreDto {
  id: string;
  name: string;
}

export interface RatesArtistSummaryCountryDto {
  id: string;
  name: string;
  isoCode: string | null;
}

export interface RatesArtistSummaryDiscHighlightDto {
  id: string;
  name: string;
  rate: number;
}

export interface RatesArtistSummaryDiscDto {
  id: string;
  name: string;
  image: string | null;
  releaseDate: string | null;
  rate: number;
  cover: number | null;
  rateId: string;
  lastActivityAt: string;
}

export interface RatesArtistSummaryResponseDto {
  artist: {
    id: string;
    name: string;
    image: string | null;
    country: RatesArtistSummaryCountryDto | null;
    genres: RatesArtistSummaryGenreDto[];
  };
  stats: {
    ratedDiscCount: number;
    averageRate: number | null;
    highestRatedDisc: RatesArtistSummaryDiscHighlightDto | null;
    lowestRatedDisc: RatesArtistSummaryDiscHighlightDto | null;
    firstAvailableActivityAt: string | null;
    lastAvailableActivityAt: string | null;
  };
  discs: {
    data: RatesArtistSummaryDiscDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
