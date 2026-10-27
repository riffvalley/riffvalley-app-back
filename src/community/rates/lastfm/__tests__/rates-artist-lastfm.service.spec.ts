import { NotFoundException } from '@nestjs/common';
import {
  LastfmArtistProfile,
  LastfmArtistProfileLookup,
} from 'src/integrations/lastfm-integration/types/lastfm-api.types';
import { RatesArtistLastfmService } from '../rates-artist-lastfm.service';

const baseProfile: LastfmArtistProfile = {
  name: 'Example Artist',
  url: 'https://www.last.fm/music/Example+Artist',
  biographySummary: 'A band biography.',
  biographyUrl: 'https://www.last.fm/music/Example+Artist/+wiki',
  tags: [],
  similarArtists: [],
  listeners: '12000',
  playCount: '85000',
};

function createService(
  lookup: LastfmArtistProfileLookup = {
    status: 'found',
    profile: baseProfile,
  },
  catalogArtist: { id: string; name: string } | null = {
    id: 'artist-id',
    name: 'Example Artist',
  },
  catalogMatches: Array<{
    catalogArtistId: string | null;
    catalogDiscCount: number;
    catalogDiscs: Array<{
      id: string;
      name: string;
      image: string | null;
      releaseYear: number | null;
    }>;
  }> = [],
  cardRows: Array<Record<string, unknown>> = [],
) {
  const artistCatalogService = {
    findIdentityById: jest.fn().mockResolvedValue(catalogArtist),
    findExactNameMatches: jest.fn().mockResolvedValue(catalogMatches),
  };
  const lastfmApiService = {
    lookupArtistProfile: jest.fn().mockResolvedValue(lookup),
  };
  const discRepository = {
    query: jest.fn().mockResolvedValue(cardRows),
  };
  return {
    service: new RatesArtistLastfmService(
      artistCatalogService,
      lastfmApiService as never,
      discRepository,
    ),
    artistCatalogService,
    lastfmApiService,
    discRepository,
  };
}

describe('RatesArtistLastfmService', () => {
  it('resolves identity from Catalog and maps only explicit Last.fm fields', async () => {
    const { service, artistCatalogService, lastfmApiService } = createService();

    await expect(
      service.getArtistInfo('artist-id', 'session-user-id'),
    ).resolves.toEqual({
      artistId: 'artist-id',
      status: 'available',
      biography: {
        summary: 'A band biography.',
        url: 'https://www.last.fm/music/Example+Artist/+wiki',
      },
      tags: [],
      similarArtists: [],
      listeners: 12000,
      playCount: 85000,
      lastfmUrl: 'https://www.last.fm/music/Example+Artist',
    });

    expect(artistCatalogService.findIdentityById).toHaveBeenCalledWith(
      'artist-id',
    );
    expect(lastfmApiService.lookupArtistProfile).toHaveBeenCalledWith(
      'Example Artist',
    );
    expect(artistCatalogService.findExactNameMatches).not.toHaveBeenCalled();
  });

  it('returns the controlled not-found result for an unknown Catalog artist', async () => {
    const { service, lastfmApiService } = createService(
      { status: 'not_found' },
      null,
    );

    await expect(
      service.getArtistInfo('missing', 'session-user-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(lastfmApiService.lookupArtistProfile).not.toHaveBeenCalled();
  });

  it('rejects non-exact Last.fm name matches to avoid artist collisions', async () => {
    const { service } = createService({
      status: 'found',
      profile: { ...baseProfile, name: 'Example Artist Tribute' },
    });

    await expect(
      service.getArtistInfo('artist-id', 'session-user-id'),
    ).resolves.toMatchObject({
      status: 'not_found',
      biography: null,
      tags: [],
      similarArtists: [],
      listeners: null,
      playCount: null,
    });
  });

  it('strips HTML, truncates biography, deduplicates and caps tags and similar artists', async () => {
    const tags = Array.from({ length: 7 }, (_, index) => ({
      name: index === 1 ? 'Tag 1' : `Tag ${index}`,
      url: `http://www.last.fm/tag/tag-${index}`,
    }));
    const similarArtists = Array.from({ length: 7 }, (_, index) => ({
      name: `Similar ${index}`,
      url: `https://www.last.fm/music/Similar+${index}`,
    }));
    const { service } = createService({
      status: 'found',
      profile: {
        ...baseProfile,
        biographySummary: `<p>Hello <strong>band</strong></p><script>alert(1)</script>${'x'.repeat(1300)}`,
        biographyUrl: 'https://evil.example/biography',
        url: 'http://www.last.fm/music/Example+Artist',
        tags,
        similarArtists,
        listeners: 'not-a-number',
        playCount: '9007199254740992',
      },
    });

    const result = await service.getArtistInfo('artist-id', 'session-user-id');

    expect(result.biography?.summary).toContain('Hello band');
    expect(result.biography?.summary).not.toContain('<script>');
    expect(result.biography?.summary).not.toContain('alert(1)');
    expect(result.biography?.summary).toHaveLength(1200);
    expect(result.biography?.url).toBe(
      'https://www.last.fm/music/Example+Artist',
    );
    expect(result.lastfmUrl).toBe('https://www.last.fm/music/Example+Artist');
    expect(result.tags).toHaveLength(5);
    expect(result.tags[0].name).toBe('Tag 0');
    expect(result.tags[0].url).toBe('https://www.last.fm/tag/tag-0');
    expect(result.similarArtists).toHaveLength(5);
    expect(result.listeners).toBeNull();
    expect(result.playCount).toBeNull();
  });

  it.each([
    'not_found',
    'unavailable',
    'not_configured',
    'invalid_response',
  ] as const)(
    'returns an empty, non-sensitive result for %s',
    async (status) => {
      const { service } = createService({ status });

      await expect(
        service.getArtistInfo('artist-id', 'session-user-id'),
      ).resolves.toMatchObject({
        artistId: 'artist-id',
        status,
        biography: null,
        tags: [],
        similarArtists: [],
        listeners: null,
        playCount: null,
        lastfmUrl: null,
      });
    },
  );

  it('keeps valid partial data and rejects non-Last.fm URLs', async () => {
    const { service } = createService({
      status: 'found',
      profile: {
        ...baseProfile,
        biographySummary: null,
        biographyUrl: 'javascript:alert(1)',
        url: 'https://attacker.example/artist',
        tags: [{ name: 'Rock', url: 'https://attacker.example/tag' }],
        similarArtists: [{ name: 'Similar', url: null }],
        listeners: null,
        playCount: null,
      },
    });

    await expect(
      service.getArtistInfo('artist-id', 'session-user-id'),
    ).resolves.toMatchObject({
      status: 'available',
      biography: null,
      tags: [{ name: 'Rock', url: null }],
      similarArtists: [
        {
          name: 'Similar',
          url: null,
          catalogArtistId: null,
          catalogDiscCount: 0,
          catalogDiscs: [],
        },
      ],
      listeners: null,
      playCount: null,
      lastfmUrl: null,
    });
  });

  it('enriches similar artists in one Catalog batch while preserving Last.fm metadata', async () => {
    const profile: LastfmArtistProfile = {
      ...baseProfile,
      tags: [{ name: 'Metal', url: 'https://www.last.fm/tag/metal' }],
      similarArtists: [
        { name: 'Catalog Band', url: 'https://www.last.fm/music/Catalog+Band' },
        { name: 'Unknown Band', url: 'https://www.last.fm/music/Unknown+Band' },
      ],
    };
    const { service, artistCatalogService, discRepository } = createService(
      { status: 'found', profile },
      undefined,
      [
        {
          catalogArtistId: 'catalog-artist-id',
          catalogDiscCount: 1,
          catalogDiscs: [
            {
              id: 'disc-id',
              name: 'Catalog Album',
              image: null,
              releaseYear: 2020,
            },
          ],
        },
        { catalogArtistId: null, catalogDiscCount: 0, catalogDiscs: [] },
      ],
      [
        {
          id: 'disc-id',
          name: 'Catalog Album',
          image: null,
          releaseYear: '2020',
          releaseDate: '2020-06-01',
          link: 'https://riffvalley.test/disc-id',
          ep: false,
          debut: true,
          genreName: 'Metal',
          genreColor: '#123456',
          averageRate: '8.5',
          averageCover: '7.5',
          voteCount: 4,
          commentCount: 2,
          userRateId: 'rate-id',
          userRate: '9.25',
          userCover: null,
          favoriteId: 'favorite-id',
          pendingId: null,
        },
      ],
    );

    await expect(
      service.getArtistInfo('artist-id', 'session-user-id'),
    ).resolves.toMatchObject({
      biography: {
        summary: 'A band biography.',
        url: 'https://www.last.fm/music/Example+Artist/+wiki',
      },
      tags: [{ name: 'Metal', url: 'https://www.last.fm/tag/metal' }],
      similarArtists: [
        {
          name: 'Catalog Band',
          url: 'https://www.last.fm/music/Catalog+Band',
          catalogArtistId: 'catalog-artist-id',
          catalogDiscCount: 1,
          catalogDiscs: [
            {
              id: 'disc-id',
              name: 'Catalog Album',
              image: null,
              releaseYear: 2020,
              releaseDate: '2020-06-01',
              link: 'https://riffvalley.test/disc-id',
              ep: false,
              debut: true,
              genre: { name: 'Metal', color: '#123456' },
              averageRate: 8.5,
              averageCover: 7.5,
              voteCount: 4,
              commentCount: 2,
              userRate: { id: 'rate-id', rate: 9.25, cover: null },
              favoriteId: 'favorite-id',
              pendingId: null,
            },
          ],
        },
        {
          name: 'Unknown Band',
          url: 'https://www.last.fm/music/Unknown+Band',
          catalogArtistId: null,
          catalogDiscCount: 0,
          catalogDiscs: [],
        },
      ],
      listeners: 12000,
      playCount: 85000,
    });
    expect(artistCatalogService.findExactNameMatches).toHaveBeenCalledTimes(1);
    expect(artistCatalogService.findExactNameMatches).toHaveBeenCalledWith([
      'Catalog Band',
      'Unknown Band',
    ]);
    expect(discRepository.query).toHaveBeenCalledTimes(1);
    expect(discRepository.query.mock.calls[0][1]).toEqual([
      ['disc-id'],
      'session-user-id',
    ]);
    expect(discRepository.query.mock.calls[0][0]).toContain(
      'GREATEST(rate."createdAt", COALESCE(rate."editedAt", rate."createdAt")) DESC',
    );
  });

  it('propagates Catalog failures instead of reporting false unmatched artists', async () => {
    const { service, artistCatalogService } = createService({
      status: 'found',
      profile: {
        ...baseProfile,
        similarArtists: [{ name: 'Similar', url: null }],
      },
    });
    artistCatalogService.findExactNameMatches.mockRejectedValue(
      new Error('catalog query failed'),
    );

    await expect(
      service.getArtistInfo('artist-id', 'session-user-id'),
    ).rejects.toThrow('catalog query failed');
  });
});
