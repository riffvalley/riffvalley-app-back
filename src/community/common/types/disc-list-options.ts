export interface DiscListOptionsCriteria {
  query?: string;
  dateRange?: [Date, Date];
  countryId?: string;
  genreId?: string;
}

export interface DiscListOptionsResult {
  countries: { id: string; name: string; isoCode: string | null }[];
  genres: { id: string; name: string; color: string | null }[];
}
