export interface RatesTopArtistDto {
  id: string;
  name: string;
  image: string | null;
  ratingCount: number;
  averageRate: number;
}

export interface RatesTopArtistsResponseDto {
  artists: RatesTopArtistDto[];
}
