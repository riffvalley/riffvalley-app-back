export type ArtistImageFillOutcome =
  | 'updated'
  | 'not_found'
  | 'ambiguous'
  | 'failed'
  | 'concurrent_update';

export interface ArtistImageFillResultItem {
  artistId: string;
  outcome: ArtistImageFillOutcome;
  reason?:
    | 'no_name_match'
    | 'multiple_name_matches'
    | 'no_image_available'
    | 'provider_error'
    | 'image_already_set'
    | 'record_unavailable';
}

export interface ArtistImageFillPreview {
  eligible: number;
  batchSize: number;
  estimatedBatches: number;
  startCursor: string | null;
}

export interface ArtistImageFillBatchResult {
  processed: number;
  updated: number;
  notFound: number;
  ambiguous: number;
  failed: number;
  concurrentUpdates: number;
  results: ArtistImageFillResultItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ArtistImageFillCursor {
  version: 1;
  after: string | null;
  upperBound: string | null;
}
