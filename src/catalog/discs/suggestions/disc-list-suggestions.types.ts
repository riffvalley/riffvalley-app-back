export interface DiscListArtistSuggestion {
  id: string;
  name: string;
  image: string | null;
  country: {
    id: string;
    name: string;
    isoCode: string | null;
  } | null;
}

export interface DiscListDiscSuggestion {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  image: string | null;
}

export interface DiscListSuggestionsResponse {
  artists: DiscListArtistSuggestion[];
  discs: DiscListDiscSuggestion[];
}
