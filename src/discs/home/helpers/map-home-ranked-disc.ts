import { mapHomePersonalState } from './home-personal-state';

/** Maps one row from the Home ranking query without dropping its selected columns. */
export function mapHomeRankedDisc(disc: Record<string, any>) {
  return {
    ...disc,
    artist: {
      name: disc.artistName,
      country: {
        id: disc.countryId,
        name: disc.countryName || null,
        isoCode: disc.countryIsoCode || null,
      },
    },
    genre: { name: disc.genreName, color: disc.genreColor },
    ...mapHomePersonalState(disc as Parameters<typeof mapHomePersonalState>[0]),
    averageRate: disc.averageRate !== null ? parseFloat(disc.averageRate) : 0,
    averageCover:
      disc.averageCover !== null ? parseFloat(disc.averageCover) : 0,
    voteCount: parseInt(disc.voteCount, 10) || 0,
    commentCount: parseInt(disc.commentCount, 10) || 0,
  };
}
