import { mapHomePersonalState } from './home-personal-state';

describe('mapHomePersonalState', () => {
  const noState = {
    userRateId: null,
    userFavoriteId: null,
    pendingId: null,
    userRate: null,
    userCover: null,
  };

  it('maps a user without personal state to null fields', () => {
    expect(mapHomePersonalState(noState)).toEqual({
      userRate: null,
      favoriteId: null,
      pendingId: null,
    });
  });

  it('maps a rate and converts SQL numeric strings while preserving its ID', () => {
    expect(
      mapHomePersonalState({
        ...noState,
        userRateId: 'rate-id',
        userRate: '4.50',
        userCover: '3.25',
      }),
    ).toEqual({
      userRate: { id: 'rate-id', rate: 4.5, cover: 3.25 },
      favoriteId: null,
      pendingId: null,
    });
  });

  it('keeps a userRate object when only cover is present on the rate row', () => {
    expect(
      mapHomePersonalState({
        ...noState,
        userRateId: 'cover-only-rate-id',
        userRate: null,
        userCover: '4.75',
      }).userRate,
    ).toEqual({ id: 'cover-only-rate-id', rate: null, cover: 4.75 });
  });

  it('maps favorite, pending, and all three states together', () => {
    expect(
      mapHomePersonalState({
        ...noState,
        userRateId: 'rate-id',
        userFavoriteId: 'favorite-id',
        pendingId: 'pending-id',
        userRate: '4',
        userCover: '2',
      }),
    ).toEqual({
      userRate: { id: 'rate-id', rate: 4, cover: 2 },
      favoriteId: 'favorite-id',
      pendingId: 'pending-id',
    });
  });

  it('preserves the existing zero-to-null conversion for rate and cover', () => {
    expect(
      mapHomePersonalState({
        ...noState,
        userRateId: 'rate-id',
        userRate: '0',
        userCover: '0',
      }).userRate,
    ).toEqual({ id: 'rate-id', rate: null, cover: null });
  });
});
