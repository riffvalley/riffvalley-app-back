export interface DiscListOptionsCriteria {
  query?: string;
  dateRange?: [Date, Date];
  countryId?: string;
  artistId?: string;
  genreId?: string;
  genreIds?: string[];
}

export interface DiscListOptionsResult {
  countries: { id: string; name: string; isoCode: string | null }[];
  genres: { id: string; name: string; color: string | null }[];
}
