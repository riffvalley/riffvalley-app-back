import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { LastfmApiService } from '../lastfm-api.service';

describe('LastfmApiService', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.LASTFM_API_KEY;
  let service: LastfmApiService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.LASTFM_API_KEY = 'test-api-key';
    service = new LastfmApiService();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY = originalApiKey;
    jest.restoreAllMocks();
  });

  it('builds artist.getinfo requests and returns the provider artist payload', async () => {
    const artist = { name: 'AC/DC' };
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ artist }),
    });

    await expect(service.getArtistInfo('AC/DC & You')).resolves.toBe(artist);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=AC%2FDC%20%26%20You&api_key=test-api-key&format=json',
    );
  });

  it('translates Last.fm HTTP and provider errors for artist requests', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    await expect(service.getArtistInfo('Artist')).rejects.toThrow(
      new BadRequestException('Last.fm responded with 429'),
    );

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue({ error: 6, message: 'Artist not found' }),
    });
    await expect(service.getArtistInfo('Artist')).rejects.toThrow(
      new BadRequestException('Artist not found'),
    );
  });

  it('parses typed artist metadata from one timed artist.getinfo request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        artist: {
          name: 'Artist',
          url: 'https://www.last.fm/music/Artist',
          bio: {
            summary: 'Description',
            links: { link: { href: 'https://www.last.fm/music/Artist/+wiki' } },
          },
          tags: {
            tag: [{ name: 'Metal', url: 'https://www.last.fm/tag/Metal' }],
          },
          similar: {
            artist: [
              { name: 'Similar', url: 'https://www.last.fm/music/Similar' },
            ],
          },
          stats: { listeners: '10', playcount: '25' },
        },
      }),
    });

    await expect(service.lookupArtistProfile('Artist')).resolves.toEqual({
      status: 'found',
      profile: {
        name: 'Artist',
        url: 'https://www.last.fm/music/Artist',
        biographySummary: 'Description',
        biographyUrl: 'https://www.last.fm/music/Artist/+wiki',
        tags: [{ name: 'Metal', url: 'https://www.last.fm/tag/Metal' }],
        similarArtists: [
          { name: 'Similar', url: 'https://www.last.fm/music/Similar' },
        ],
        listeners: '10',
        playCount: '25',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('method=artist.getinfo&artist=Artist'),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('searches timed Last.fm artist candidates and extracts a usable image', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        results: {
          artistmatches: {
            artist: [
              {
                name: 'Artist',
                image: 'https://lastfm.test/artist.jpg',
                image_small: 'https://lastfm.test/artist-small.jpg',
              },
              {
                name: 'Placeholder Artist',
                image: [
                  {
                    '#text':
                      'https://lastfm.test/2a96cbd8b46e442fc41c2b86b821562f.png',
                    size: 'large',
                  },
                ],
              },
            ],
          },
        },
      }),
    });

    await expect(
      service.searchArtistImageCandidates('Artist & Friends'),
    ).resolves.toEqual({
      status: 'found',
      candidates: [
        { name: 'Artist', imageUrl: 'https://lastfm.test/artist.jpg' },
        { name: 'Placeholder Artist', imageUrl: null },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'method=artist.search&artist=Artist%20%26%20Friends&limit=5',
      ),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('classifies Last.fm artist image search provider failures', async () => {
    fetchMock.mockRejectedValue(new Error('provider timed out'));
    await expect(
      service.searchArtistImageCandidates('Artist'),
    ).resolves.toEqual({ status: 'unavailable' });

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ results: {} }),
    });
    await expect(
      service.searchArtistImageCandidates('Artist'),
    ).resolves.toEqual({ status: 'invalid_response' });
  });

  it.each([
    ['missing artist', { error: 6 }, 'not_found'],
    ['provider error', { error: 29 }, 'unavailable'],
    ['malformed artist', { artist: { stats: {} } }, 'invalid_response'],
  ] as const)(
    'classifies %s without exposing provider details',
    async (_label, body, status) => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(body),
      });
      await expect(
        service.lookupArtistProfile('Artist'),
      ).resolves.toMatchObject({ status });
    },
  );

  it('handles timeout and missing API configuration', async () => {
    fetchMock.mockRejectedValue(new Error('provider timed out'));
    await expect(service.lookupArtistProfile('Artist')).resolves.toEqual({
      status: 'unavailable',
    });

    delete process.env.LASTFM_API_KEY;
    const unconfiguredService = new LastfmApiService();
    await expect(
      unconfiguredService.lookupArtistProfile('Artist'),
    ).resolves.toEqual({ status: 'not_configured' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies an unreadable provider body as an invalid response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockRejectedValue(new Error('invalid JSON')),
    });

    await expect(service.lookupArtistProfile('Artist')).resolves.toEqual({
      status: 'invalid_response',
    });
  });

  it('selects the best available album image and builds album.getinfo requests', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        album: {
          image: [
            { size: 'large', '#text': 'https://img.test/large.jpg' },
            { size: 'mega', '#text': 'https://img.test/mega.jpg' },
          ],
        },
      }),
    });

    await expect(service.getAlbumImage('AC/DC', 'Back in Black')).resolves.toBe(
      'https://img.test/mega.jpg',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ws.audioscrobbler.com/2.0/?method=album.getinfo&artist=AC%2FDC&album=Back%20in%20Black&api_key=test-api-key&format=json',
    );
  });

  it.each([
    ['provider error', { error: 6 }],
    ['missing album', {}],
    ['missing images', { album: {} }],
    [
      'no preferred image',
      { album: { image: [{ size: 'small', '#text': 'small' }] } },
    ],
  ])('returns null for %s album responses', async (_label, body) => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(body),
    });
    await expect(service.getAlbumImage('Artist', 'Album')).resolves.toBeNull();
  });

  it('returns null for album HTTP, network, and invalid JSON failures', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(service.getAlbumImage('Artist', 'Album')).resolves.toBeNull();

    fetchMock.mockRejectedValue(new Error('unreachable'));
    await expect(service.getAlbumImage('Artist', 'Album')).resolves.toBeNull();

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockRejectedValue(new Error('invalid JSON')),
    });
    await expect(service.getAlbumImage('Artist', 'Album')).resolves.toBeNull();
  });

  it('requires the API key before making a request', async () => {
    delete process.env.LASTFM_API_KEY;
    const unconfiguredService = new LastfmApiService();

    expect(() => unconfiguredService.assertConfigured()).toThrow(
      new InternalServerErrorException('LASTFM_API_KEY not configured'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
