import { mapHomeRankedDisc } from './map-home-ranked-disc';

describe('mapHomeRankedDisc', () => {
  it('preserves selected SQL columns while mapping relations, personal state, and metrics', () => {
    const row = {
      id: 'disc-1',
      name: 'Album',
      releaseDate: new Date('2024-03-01T00:00:00.000Z'),
      description: 'Description',
      image: 'cover.jpg',
      verified: true,
      ep: false,
      debut: true,
      link: 'https://example.test/album',
      featured: true,
      pinned: false,
      artistId: 'artist-1',
      genreId: 'genre-1',
      artistName: 'Artist',
      countryId: 'country-1',
      countryName: 'Country',
      countryIsoCode: 'CC',
      genreName: 'Genre',
      genreColor: '#123456',
      voteCount: '2',
      averageRate: '4.25',
      averageCover: '3.50',
      userRateId: 'rate-1',
      userFavoriteId: 'favorite-1',
      pendingId: 'pending-1',
      userRate: '4.5',
      userCover: '3.5',
      commentCount: '7',
      weightedScore: '4.1',
    };

    expect(mapHomeRankedDisc(row)).toEqual({
      ...row,
      artist: {
        name: 'Artist',
        country: { id: 'country-1', name: 'Country', isoCode: 'CC' },
      },
      genre: { name: 'Genre', color: '#123456' },
      userRate: { id: 'rate-1', rate: 4.5, cover: 3.5 },
      favoriteId: 'favorite-1',
      pendingId: 'pending-1',
      averageRate: 4.25,
      averageCover: 3.5,
      voteCount: 2,
      commentCount: 7,
    });
  });

  it('keeps optional relation fields and personal state null and converts null metrics to zero', () => {
    const row = {
      id: 'disc-2',
      name: 'Pinned',
      artistName: null,
      countryId: null,
      countryName: null,
      countryIsoCode: null,
      genreName: null,
      genreColor: null,
      userRateId: null,
      userFavoriteId: null,
      pendingId: null,
      userRate: null,
      userCover: null,
      averageRate: null,
      averageCover: null,
      voteCount: '0',
      commentCount: null,
      weightedScore: '0',
    };

    expect(mapHomeRankedDisc(row)).toEqual({
      ...row,
      artist: {
        name: null,
        country: { id: null, name: null, isoCode: null },
      },
      genre: { name: null, color: null },
      userRate: null,
      favoriteId: null,
      pendingId: null,
      averageRate: 0,
      averageCover: 0,
      voteCount: 0,
      commentCount: 0,
    });
  });

  it('preserves zero personal values as null under the existing personal-state mapping', () => {
    expect(
      mapHomeRankedDisc({
        artistName: 'Artist',
        countryId: null,
        countryName: '',
        countryIsoCode: '',
        genreName: 'Genre',
        genreColor: null,
        userRateId: 'rate-2',
        userFavoriteId: '',
        pendingId: undefined,
        userRate: '0',
        userCover: '0',
        averageRate: '0',
        averageCover: '0',
        voteCount: '0',
        commentCount: '0',
      }),
    ).toMatchObject({
      userRate: { id: 'rate-2', rate: null, cover: null },
      favoriteId: null,
      pendingId: null,
      averageRate: 0,
      averageCover: 0,
      voteCount: 0,
      commentCount: 0,
      artist: { country: { id: null, name: null, isoCode: null } },
    });
  });
});
