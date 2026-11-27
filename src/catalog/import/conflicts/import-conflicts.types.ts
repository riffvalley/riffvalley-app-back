import { EventType } from '../../events/entities/event.entity';

export type ImportEventInputType = 'concert' | 'festival' | 'tour';
export type ImportIdentityStatus =
  | 'existing'
  | 'created'
  | 'ambiguous'
  | 'invalid'
  | 'conflict';

export interface ImportConflictArtist {
  name: string;
  status: ImportIdentityStatus;
  artistId?: string | null;
}

export interface ImportConflictLocality {
  status: ImportIdentityStatus;
  localityId?: string | null;
  /** Required to compare an unpersisted locality safely between rows. */
  provisionalIdentity?: {
    administrativeRegionId: string;
    city: string;
    province?: string | null;
  };
}

export interface ImportConflictRow {
  rowId: string;
  type: ImportEventInputType;
  name?: string | null;
  artists: ImportConflictArtist[];
  startDate: string;
  endDate?: string | null;
  locality: ImportConflictLocality;
  /** Venue is informational only: it never suppresses an artist/date/locality conflict. */
  venueId?: string | null;
  /** Optional selections retained from a prior preview for CON-B04d revalidation. */
  existingEventIds?: string[];
}

export type ImportConflictCode =
  | 'CONCERT_DUPLICATE'
  | 'CONCERT_ARTIST_DATE_LOCALITY_CONFLICT'
  | 'CONCERT_FESTIVAL_PARTICIPATION_CONFLICT'
  | 'FESTIVAL_DUPLICATE'
  | 'FESTIVAL_POSSIBLE_DUPLICATE';

export type ImportConflictKind = 'participation' | 'duplicate';

export interface ImportConflictResult {
  rowId: string;
  kind: ImportConflictKind;
  code: ImportConflictCode;
  severity: 'blocking' | 'review';
  message: string;
  relatedRowIds: string[];
  existingEventIds: string[];
  matchingArtists: Array<{ artistId: string | null; name: string }>;
  addableArtists: Array<{ artistId: string | null; name: string }>;
  candidateEventIds: string[];
}

export interface ImportConflictAnalysis {
  rowId: string;
  conflicts: ImportConflictResult[];
}

export interface ExistingImportEventCandidate {
  id: string;
  type: EventType;
  name: string | null;
  startDate: string;
  endDate: string | null;
  localityId: string;
  lineup: Array<{ artistId: string | null; name: string }>;
}
