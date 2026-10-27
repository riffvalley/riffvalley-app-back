export interface RatesGeographyCountryDto {
  isoCode: string;
  name: string;
  count: number;
  percentage: number;
}

export interface RatesGeographyTopResponseDto {
  countries: RatesGeographyCountryDto[];
}

export interface RatesGeographyWorldResponseDto
  extends RatesGeographyTopResponseDto {
  totalRatedDiscs: number;
  mappedDiscs: number;
  unmappedDiscs: number;
  countryCount: number;
}

export interface RatesHomeInsightsResponse {
  topArtists: {
    id: string;
    name: string;
    image: string;
    averageRate: number;
    ratingCount: number;
  }[];
  countries: RatesGeographyCountryDto[];
}
