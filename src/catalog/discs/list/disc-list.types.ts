import { DiscListMode } from './dto/disc-list-contracts.dto';

export interface DiscListCountry {
  id: string;
  name: string;
  isoCode: string | null;
}

export interface DiscListGenre {
  id: string;
  name: string;
  color: string | null;
}

export interface DiscListUserRate {
  id: string;
  rate: number | null;
  cover: number | null;
}

export interface DiscListCardProjection {
  id: string;
  name: string;
  image: string | null;
  releaseDate: string | null;
  link: string | null;
  ep: boolean;
  debut: boolean;
  artist: {
    name: string;
    country: DiscListCountry | null;
  };
  genre: DiscListGenre | null;
  averageRate: number | null;
  averageCover: number | null;
  voteCount: number;
  commentCount: number;
  userRate: DiscListUserRate | null;
  favoriteId: string | null;
  pendingId: string | null;
}

export interface DiscListDiscItem extends DiscListCardProjection {
  itemType: 'disc';
  entryId: string;
}

export interface DiscListRateItem extends DiscListCardProjection {
  itemType: 'rate';
  entryId: string;
}

export interface DiscListCoverItem extends DiscListCardProjection {
  itemType: 'cover';
  entryId: string;
}

export interface DiscListFavoriteItem extends DiscListCardProjection {
  itemType: 'favorite';
  entryId: string;
}

export interface DiscListPendingItem extends DiscListCardProjection {
  itemType: 'pending';
  entryId: string;
}

export interface DiscListCommentItem {
  itemType: 'comment';
  entryId: string;
  comment: string;
  createdAt: string;
  disc: DiscListCommentDiscProjection;
}

export interface DiscListCommentDiscProjection {
  id: string;
  name: string;
  image: string | null;
  releaseDate: string | null;
  artist: {
    name: string;
    country: DiscListCountry | null;
  };
  genre: DiscListGenre | null;
}

export type DiscListItemByMode = {
  [DiscListMode.ALL]: DiscListDiscItem;
  [DiscListMode.RATES]: DiscListRateItem;
  [DiscListMode.COVERS]: DiscListCoverItem;
  [DiscListMode.COMMENTS]: DiscListCommentItem;
  [DiscListMode.FAVORITES]: DiscListFavoriteItem;
  [DiscListMode.PENDIENTES]: DiscListPendingItem;
};

export interface DiscListPageMetadata {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

export type DiscListPage<M extends DiscListMode = DiscListMode> = {
  data: DiscListItemByMode[M][];
} & DiscListPageMetadata;

export type DiscListResponse = {
  [M in DiscListMode]: DiscListPage<M>;
}[DiscListMode];

export interface DiscListOptionsResponse {
  countries: DiscListCountry[];
  genres: DiscListGenre[];
}
