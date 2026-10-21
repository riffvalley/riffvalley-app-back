import { Disc } from '../../../entities/disc.entity';
import { mapCatalogDisc } from '../map-catalog-disc';

type UserState = {
  rates: Array<{ id: string; rate: number | null; cover: number | null }>;
  favorites: Array<{ id: string }>;
  pendings: Array<{ id: string }>;
};

function createDiscFixture(properties: object): Disc {
  return Object.assign(new Disc(), properties);
}

describe('mapCatalogDisc', () => {
  it('maps entity state and normalizes raw aggregates with the existing defaults', () => {
    const rate = { id: 'rate-id', rate: 8, cover: null };
    const disc = createDiscFixture({
      id: 'disc-id',
      artist: { id: 'artist-id', country: null },
      rates: [rate],
      favorites: [{ id: 'favorite-id' }],
      pendings: [{ id: 'pending-id' }],
    });

    expect(
      mapCatalogDisc(disc, {
        discId: 'disc-id',
        averagerate: '0',
        averageCover: '7.25',
        rateCount: null,
        commentCount: '3',
      }),
    ).toEqual({
      ...disc,
      artist: { ...disc.artist, country: { name: null } },
      userRate: rate,
      averageRate: null,
      averageCover: 7.25,
      voteCount: 0,
      commentCount: 3,
      favoriteId: 'favorite-id',
      pendingId: 'pending-id',
    });
  });

  it.each<
    [
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      number | null,
      number | null,
      number,
      number,
    ]
  >([
    ['no ratings or comments', null, null, '0', '0', null, null, 0, 0],
    ['one rating', '8.25', '9.5', '1', '1', 8.25, 9.5, 1, 1],
    [
      'several ratings',
      '6.666666666666667',
      '7.125',
      '3',
      '4',
      6.666666666666667,
      7.125,
      3,
      4,
    ],
    [
      'zero averages and null counts',
      '0',
      '0.00',
      null,
      null,
      null,
      null,
      0,
      0,
    ],
  ])(
    'normalizes aggregate values for %s',
    (
      _label,
      average,
      cover,
      votes,
      comments,
      expectedAverage,
      expectedCover,
      expectedVotes,
      expectedComments,
    ) => {
      const disc = createDiscFixture({
        id: 'disc-id',
        artist: { country: {} },
        rates: [],
        favorites: [],
        pendings: [],
      });

      const mapped = mapCatalogDisc(disc, {
        discId: disc.id,
        averagerate: average,
        averageCover: cover,
        rateCount: votes,
        commentCount: comments,
      });

      expect(mapped).toMatchObject({
        averageRate: expectedAverage,
        averageCover: expectedCover,
        voteCount: expectedVotes,
        commentCount: expectedComments,
      });
    },
  );

  it.each<[string, UserState, Record<string, unknown>]>([
    [
      'no user state',
      { rates: [], favorites: [], pendings: [] },
      { userRate: null, favoriteId: null, pendingId: null },
    ],
    [
      'a rate without a cover vote',
      {
        rates: [{ id: 'rate-id', rate: 8.5, cover: null }],
        favorites: [],
        pendings: [],
      },
      {
        userRate: { id: 'rate-id', rate: 8.5, cover: null },
        favoriteId: null,
        pendingId: null,
      },
    ],
    [
      'a cover vote without a rate vote',
      {
        rates: [{ id: 'cover-id', rate: null, cover: 7.25 }],
        favorites: [],
        pendings: [],
      },
      {
        userRate: { id: 'cover-id', rate: null, cover: 7.25 },
        favoriteId: null,
        pendingId: null,
      },
    ],
    [
      'a favorite only',
      { rates: [], favorites: [{ id: 'favorite-id' }], pendings: [] },
      { userRate: null, favoriteId: 'favorite-id', pendingId: null },
    ],
    [
      'a pending only',
      { rates: [], favorites: [], pendings: [{ id: 'pending-id' }] },
      { userRate: null, favoriteId: null, pendingId: 'pending-id' },
    ],
    [
      'rate, cover, favorite and pending together',
      {
        rates: [{ id: 'rate-id', rate: 8.5, cover: 7.25 }],
        favorites: [{ id: 'favorite-id' }],
        pendings: [{ id: 'pending-id' }],
      },
      {
        userRate: { id: 'rate-id', rate: 8.5, cover: 7.25 },
        favoriteId: 'favorite-id',
        pendingId: 'pending-id',
      },
    ],
  ])('maps derived user state for %s', (_label, relations, derivedState) => {
    const disc = createDiscFixture({
      id: 'disc-id',
      artist: { country: {} },
      ...relations,
    });

    expect(
      mapCatalogDisc(disc, {
        discId: disc.id,
        averagerate: '6.5',
        averageCover: '7.25',
        rateCount: '4',
        commentCount: '3',
      }),
    ).toMatchObject({
      ...relations,
      ...derivedState,
      averageRate: 6.5,
      averageCover: 7.25,
      voteCount: 4,
      commentCount: 3,
    });
  });
});
