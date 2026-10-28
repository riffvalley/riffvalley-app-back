import {
  DiscListCardProjection,
  DiscListCommentItem,
  DiscListCoverItem,
  DiscListDiscItem,
  DiscListFavoriteItem,
  DiscListPendingItem,
  DiscListRateItem,
} from '../disc-list.types';

export type DiscListNumericValue = number | string | null | undefined;

interface DiscListCountrySource {
  id: string;
  name: string;
  isoCode: string | null;
}

interface DiscListGenreSource {
  id: string;
  name: string;
  color: string | null;
}

interface DiscListUserRateSource {
  id: string;
  rate: DiscListNumericValue;
  cover: DiscListNumericValue;
}

export interface DiscListSourceDisc {
  id: string;
  name: string;
  image: string | null;
  releaseDate: Date | string | null;
  link: string | null;
  ep: boolean | null;
  debut: boolean | null;
  artist: {
    name: string;
    country?: DiscListCountrySource | null;
  };
  genre?: DiscListGenreSource | null;
  averageRate?: DiscListNumericValue;
  averageCover?: DiscListNumericValue;
  voteCount?: DiscListNumericValue;
  commentCount?: DiscListNumericValue;
  userRate?: DiscListUserRateSource | null;
  favoriteId?: string | null;
  pendingId?: string | null;
  userFavorite?: { id: string } | null;
  userPending?: string | { id: string } | null;
}

export interface DiscListRateSource {
  id: string;
  rate: DiscListNumericValue;
  cover: DiscListNumericValue;
  disc: DiscListSourceDisc;
}

export interface DiscListFavoriteSource {
  id: string;
  disc: DiscListSourceDisc;
}

export interface DiscListPendingSource {
  id: string;
  disc: DiscListSourceDisc;
}

export interface DiscListCommentSource {
  id: string;
  comment: string;
  createdAt: Date | string;
  disc: Pick<
    DiscListSourceDisc,
    'id' | 'name' | 'image' | 'releaseDate' | 'artist' | 'genre'
  >;
}

function toNumber(value: DiscListNumericValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateString(value: Date | string | null): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }
  return value === null ? null : value.slice(0, 10);
}

function toDateTimeString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function mapDiscListCard(
  source: DiscListSourceDisc,
  personalState: {
    userRate?: DiscListUserRateSource | null;
    favoriteId?: string | null;
    pendingId?: string | null;
  } = {},
): DiscListCardProjection {
  const userRate = personalState.userRate ?? source.userRate;
  const pendingFromSource = source.userPending;
  const pendingId =
    personalState.pendingId ??
    source.pendingId ??
    (typeof pendingFromSource === 'string'
      ? pendingFromSource
      : (pendingFromSource?.id ?? null));

  return {
    id: source.id,
    name: source.name,
    image: source.image,
    releaseDate: toDateString(source.releaseDate),
    link: source.link,
    ep: source.ep ?? false,
    debut: source.debut ?? false,
    artist: {
      name: source.artist.name,
      country: source.artist.country
        ? {
            id: source.artist.country.id,
            name: source.artist.country.name,
            isoCode: source.artist.country.isoCode,
          }
        : null,
    },
    genre: source.genre
      ? {
          id: source.genre.id,
          name: source.genre.name,
          color: source.genre.color,
        }
      : null,
    averageRate: toNumber(source.averageRate),
    averageCover: toNumber(source.averageCover),
    voteCount: toNumber(source.voteCount) ?? 0,
    commentCount: toNumber(source.commentCount) ?? 0,
    userRate: userRate
      ? {
          id: userRate.id,
          rate: toNumber(userRate.rate),
          cover: toNumber(userRate.cover),
        }
      : null,
    favoriteId:
      personalState.favoriteId ??
      source.favoriteId ??
      source.userFavorite?.id ??
      null,
    pendingId,
  };
}

export function mapDiscListDisc(source: DiscListSourceDisc): DiscListDiscItem {
  return {
    ...mapDiscListCard(source),
    itemType: 'disc',
    entryId: source.id,
  };
}

export function mapDiscListRate(
  source: DiscListRateSource,
  itemType: 'rate',
): DiscListRateItem;
export function mapDiscListRate(
  source: DiscListRateSource,
  itemType: 'cover',
): DiscListCoverItem;
export function mapDiscListRate(
  source: DiscListRateSource,
  itemType: 'rate' | 'cover',
): DiscListRateItem | DiscListCoverItem {
  const card = mapDiscListCard(source.disc, {
    userRate: { id: source.id, rate: source.rate, cover: source.cover },
  });

  return itemType === 'rate'
    ? { ...card, itemType, entryId: source.id }
    : { ...card, itemType, entryId: source.id };
}

export function mapDiscListFavorite(
  source: DiscListFavoriteSource,
): DiscListFavoriteItem {
  return {
    ...mapDiscListCard(source.disc, { favoriteId: source.id }),
    itemType: 'favorite',
    entryId: source.id,
  };
}

export function mapDiscListPending(
  source: DiscListPendingSource,
): DiscListPendingItem {
  return {
    ...mapDiscListCard(source.disc, { pendingId: source.id }),
    itemType: 'pending',
    entryId: source.id,
  };
}

export function mapDiscListComment(
  source: DiscListCommentSource,
): DiscListCommentItem {
  return {
    itemType: 'comment',
    entryId: source.id,
    comment: source.comment,
    createdAt: toDateTimeString(source.createdAt),
    disc: {
      id: source.disc.id,
      name: source.disc.name,
      image: source.disc.image,
      releaseDate: toDateString(source.disc.releaseDate),
      artist: {
        name: source.disc.artist.name,
        country: source.disc.artist.country
          ? {
              id: source.disc.artist.country.id,
              name: source.disc.artist.country.name,
              isoCode: source.disc.artist.country.isoCode,
            }
          : null,
      },
      genre: source.disc.genre
        ? {
            id: source.disc.genre.id,
            name: source.disc.genre.name,
            color: source.disc.genre.color,
          }
        : null,
    },
  };
}
