export type DiscListReaderSort =
  | 'releaseDateDesc'
  | 'releaseDateAsc'
  | 'artistNameAsc'
  | 'discNameAsc'
  | 'createdAtDesc'
  | 'createdAtAsc'
  | 'myRateDesc'
  | 'myRateAsc'
  | 'myCoverDesc'
  | 'myCoverAsc'
  | 'averageRateDesc'
  | 'averageRateAsc'
  | 'averageCoverDesc'
  | 'averageCoverAsc'
  | 'voteCountDesc'
  | 'commentCountDesc';

export interface DiscListReaderCriteria {
  limit: number;
  offset: number;
  query?: string;
  dateRange?: [Date, Date];
  countryId?: string;
  genreId?: string;
  sort?: DiscListReaderSort;
}

export type DiscListReaderNumber = number | string | null;

export interface DiscListReaderDiscSource {
  id: string;
  name: string;
  image: string | null;
  releaseDate: Date | string | null;
  link: string | null;
  ep: boolean | null;
  debut: boolean | null;
  artist: {
    name: string;
    country?: {
      id: string;
      name: string;
      isoCode: string | null;
    } | null;
  };
  genre?: { id: string; name: string; color: string | null } | null;
  averageRate?: DiscListReaderNumber;
  averageCover?: DiscListReaderNumber;
  voteCount?: DiscListReaderNumber;
  commentCount?: DiscListReaderNumber;
  userRate?: {
    id: string;
    rate: DiscListReaderNumber;
    cover: DiscListReaderNumber;
  } | null;
  favoriteId?: string | null;
  pendingId?: string | null;
  userFavorite?: { id: string } | null;
  userPending?: string | { id: string } | null;
}

export interface DiscListReaderPage<T> {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  data: T[];
}

export interface DiscListReaderRateRecord {
  id: string;
  rate: DiscListReaderNumber;
  cover: DiscListReaderNumber;
  disc: DiscListReaderDiscSource;
}

export interface DiscListReaderFavoriteRecord {
  id: string;
  disc: DiscListReaderDiscSource;
}

export interface DiscListReaderPendingRecord {
  id: string;
  disc: DiscListReaderDiscSource;
}

export interface DiscListReaderCommentRecord {
  id: string;
  comment: string;
  createdAt: Date | string;
  disc: Pick<
    DiscListReaderDiscSource,
    'id' | 'name' | 'image' | 'releaseDate' | 'artist' | 'genre'
  >;
}
