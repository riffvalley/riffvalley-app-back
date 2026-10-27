export interface ArtistCatalogDiscSummary {
  id: string;
  name: string;
  image: string | null;
  releaseYear: number | null;
}

export interface ArtistCatalogNameMatch {
  catalogArtistId: string | null;
  catalogDiscCount: number;
  catalogDiscs: ArtistCatalogDiscSummary[];
}
