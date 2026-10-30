import { mapHomePersonalState } from './home-personal-state';

export interface HomeRankedDisc extends Record<string, unknown> {
  id: string;
  artist: {
    name: string | null;
    country: {
      id: string | null;
      name: string | null;
      isoCode: string | null;
    };
  };
  genre: { name: string | null; color: string | null };
  userRate: {
    id: string | number;
    rate: number | null;
    cover: number | null;
  } | null;
  favoriteId: string | number | null;
  pendingId: string | number | null;
  averageRate: number | null;
  averageCover: number;
  voteCount: number;
  commentCount: number;
  weightedScore: string | number | null;
}

function scalarId(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Maps one row from the Home ranking query without dropping its selected columns. */
export function mapHomeRankedDisc(
  disc: Record<string, unknown>,
): HomeRankedDisc {
  const personalState = {
    userRateId: scalarId(disc.userRateId),
    userFavoriteId: scalarId(disc.userFavoriteId),
    pendingId: scalarId(disc.pendingId),
    userRate: nullableString(disc.userRate),
    userCover: nullableString(disc.userCover),
  };
  return {
    ...disc,
    id: String(disc.id),
    artist: {
      name: nullableString(disc.artistName),
      country: {
        id: nullableString(disc.countryId),
        name: nullableString(disc.countryName) || null,
        isoCode: nullableString(disc.countryIsoCode) || null,
      },
    },
    genre: {
      name: nullableString(disc.genreName),
      color: nullableString(disc.genreColor),
    },
    ...mapHomePersonalState(personalState),
    averageRate:
      disc.averageRate === null || disc.averageRate === undefined
        ? null
        : Number.parseFloat(String(disc.averageRate)),
    averageCover:
      disc.averageCover !== null
        ? Number.parseFloat(String(disc.averageCover))
        : 0,
    voteCount: Number.parseInt(String(disc.voteCount), 10) || 0,
    commentCount: Number.parseInt(String(disc.commentCount), 10) || 0,
    weightedScore:
      typeof disc.weightedScore === 'string' ||
      typeof disc.weightedScore === 'number'
        ? disc.weightedScore
        : null,
  };
}
