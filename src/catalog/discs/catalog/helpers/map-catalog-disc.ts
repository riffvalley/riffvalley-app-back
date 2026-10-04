import { Disc } from '../../entities/disc.entity';
import { CatalogRawRow } from './catalog-raw-rows';

export function mapCatalogDisc(
  disc: Disc,
  raw: CatalogRawRow,
) {
  return {
    ...disc,
    artist: {
      ...disc.artist,
      country: {
        ...disc.artist.country,
        name: disc.artist?.country?.name || null,
      },
    },
    userRate: disc.rates.length > 0 ? disc.rates[0] : null,
    averageRate: parseFloat(raw.averagerate) || null,
    averageCover: parseFloat(raw.averageCover) || null,
    commentCount: parseInt(raw.commentCount, 10) || 0,
    voteCount: parseInt(raw.rateCount, 10) || 0,
    favoriteId: disc.favorites.length > 0 ? disc.favorites[0].id : null,
    pendingId:
      disc.pendings && disc.pendings.length > 0 ? disc.pendings[0].id : null,
  };
}
