import { NotFoundException } from '@nestjs/common';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
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
  catalogArtist: Artist | null = Object.assign(new Artist(), {
    id: 'artist-id',
    name: 'Example Artist',
  }),
) {
  const artistRepository = {
    findOne: jest.fn().mockResolvedValue(catalogArtist),
  };
  const lastfmApiService = {
    lookupArtistProfile: jest.fn().mockResolvedValue(lookup),
  };
  return {
    service: new RatesArtistLastfmService(
      artistRepository as never,
      lastfmApiService as never,
    ),
    artistRepository,
    lastfmApiService,
  };
}

describe('RatesArtistLastfmService', () => {
  it('resolves identity from Catalog and maps only explicit Last.fm fields', async () => {
    const { service, artistRepository, lastfmApiService } = createService();

    await expect(service.getArtistInfo('artist-id')).resolves.toEqual({
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

    expect(artistRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'artist-id' },
      select: { id: true, name: true },
    });
    expect(lastfmApiService.lookupArtistProfile).toHaveBeenCalledWith(
      'Example Artist',
    );
    expect(Object.keys(artistRepository)).toEqual(['findOne']);
  });

  it('returns the controlled not-found result for an unknown Catalog artist', async () => {
    const { service, lastfmApiService } = createService(
      { status: 'not_found' },
      null,
    );

    await expect(service.getArtistInfo('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(lastfmApiService.lookupArtistProfile).not.toHaveBeenCalled();
  });

  it('rejects non-exact Last.fm name matches to avoid artist collisions', async () => {
    const { service } = createService({
      status: 'found',
      profile: { ...baseProfile, name: 'Example Artist Tribute' },
    });

    await expect(service.getArtistInfo('artist-id')).resolves.toMatchObject({
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

    const result = await service.getArtistInfo('artist-id');

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

      await expect(service.getArtistInfo('artist-id')).resolves.toMatchObject({
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

    await expect(service.getArtistInfo('artist-id')).resolves.toMatchObject({
      status: 'available',
      biography: null,
      tags: [{ name: 'Rock', url: null }],
      similarArtists: [{ name: 'Similar', url: null }],
      listeners: null,
      playCount: null,
      lastfmUrl: null,
    });
  });
});
