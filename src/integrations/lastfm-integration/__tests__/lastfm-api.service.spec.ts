import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
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
    fetchMock.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ artist }) });

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
      json: jest.fn().mockResolvedValue({ error: 6, message: 'Artist not found' }),
    });
    await expect(service.getArtistInfo('Artist')).rejects.toThrow(
      new BadRequestException('Artist not found'),
    );
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
    ['no preferred image', { album: { image: [{ size: 'small', '#text': 'small' }] } }],
  ])('returns null for %s album responses', async (_label, body) => {
    fetchMock.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue(body) });
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
