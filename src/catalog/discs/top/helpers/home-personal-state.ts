type HomePersonalStateRow = {
  userRateId: string | number | null;
  userFavoriteId: string | number | null;
  pendingId: string | number | null;
  userRate: string | null;
  userCover: string | null;
};

/** Maps the personal state aliases selected by the home ranking query. */
export function mapHomePersonalState(disc: HomePersonalStateRow) {
  return {
    userRate: disc.userRateId
      ? {
          id: disc.userRateId,
          rate: parseFloat(disc.userRate as string) || null,
          cover: parseFloat(disc.userCover as string) || null,
        }
      : null,
    favoriteId: disc.userFavoriteId || null,
    pendingId: disc.pendingId || null,
  };
}
