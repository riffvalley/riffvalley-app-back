import type { Disc } from '../../entities/disc.entity';

export function mapNationalReleaseIds(
  rows: { discId: string; id: string }[],
) {
  return new Map(rows.map((row) => [row.discId, row.id]));
}

export function mapAuthenticatedCalendarDiscGroups(
  discs: Disc[],
  nationalReleaseMap: Map<string, string>,
) {
  const groupedDiscs = discs.reduce((acc, disc) => {
    const dateKey = new Date(disc.releaseDate).toISOString().split('T')[0];

    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }

    acc[dateKey].push({
      ...disc,
      artist: {
        ...disc.artist,
        country: {
          ...disc.artist.country,
          name: disc.artist?.country?.name || null,
        },
      },
      userRate: disc.rates.length > 0 ? disc.rates[0] : null,
      favoriteId: disc.favorites.length > 0 ? disc.favorites[0].id : null,
      pendingId:
        disc.pendings && disc.pendings.length > 0
          ? disc.pendings[0].id
          : null,
      nationalReleaseId: nationalReleaseMap.get(disc.id) ?? null,
      asignations: disc.asignations.map((asignation) => ({
        id: asignation.id,
        done: asignation.done,
        user: asignation.user,
        list: asignation.list,
      })),
    });
    return acc;
  }, {});

  return Object.keys(groupedDiscs).map((releaseDate) => ({
    releaseDate,
    discs: groupedDiscs[releaseDate],
  }));
}

export function mapPublicCalendarDiscGroups(discs: Disc[]) {
  const groupedDiscs = discs.reduce((acc, disc) => {
    const dateKey = new Date(disc.releaseDate).toISOString().split('T')[0];

    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }

    acc[dateKey].push({
      id: disc.id,
      name: disc.name,
      image: disc.image,
      releaseDate: disc.releaseDate,
      ep: disc.ep,
      debut: disc.debut,
      link: disc.link,
      genre: disc.genre,
      artist: {
        id: disc.artist?.id,
        name: disc.artist?.name,
        image: disc.artist?.image,
        country: disc.artist?.country
          ? {
              id: disc.artist.country.id,
              name: disc.artist.country.name,
            }
          : null,
      },
    });
    return acc;
  }, {});

  return Object.keys(groupedDiscs).map((releaseDate) => ({
    releaseDate,
    discs: groupedDiscs[releaseDate],
  }));
}
