import { SpotifyOAuthApiService } from './spotify-oauth-api.service';
import { SpotifyAccountApiService } from './spotify-account-api.service';

describe('SpotifyAccountApiService', () => {
  let oauthApi: { request: jest.Mock };
  let service: SpotifyAccountApiService;

  beforeEach(() => {
    oauthApi = { request: jest.fn() };
    service = new SpotifyAccountApiService(
      oauthApi as unknown as SpotifyOAuthApiService,
    );
  });

  it('encapsula los endpoints de cuenta para playlist, perfil, metadata e imagen', async () => {
    oauthApi.request
      .mockResolvedValueOnce({ id: 'account-id', display_name: 'Riff Valley' })
      .mockResolvedValueOnce({
        id: 'remote-id',
        name: 'Festival',
        external_urls: { spotify: 'https://open.spotify.com/playlist/id' },
      })
      .mockResolvedValueOnce({ id: 'remote-id', owner: { id: 'account-id' } })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ url: 'https://images.test/cover.jpg' }]);

    await service.getProfile('access');
    await service.createPlaylist('access', {
      name: 'Festival',
      description: 'Descripción',
      public: false,
    });
    await service.getPlaylist('access', 'remote-id');
    await service.updatePlaylist('access', 'remote-id', { name: 'Nuevo' });
    await service.uploadPlaylistImage('access', 'remote-id', 'base64-image');
    await service.getPlaylistImages('access', 'remote-id');

    expect(oauthApi.request.mock.calls).toEqual([
      ['/me', 'access'],
      [
        '/me/playlists',
        'access',
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'Festival',
            description: 'Descripción',
            public: false,
          }),
        },
      ],
      ['/playlists/remote-id', 'access'],
      [
        '/playlists/remote-id',
        'access',
        { method: 'PUT', body: JSON.stringify({ name: 'Nuevo' }) },
      ],
      [
        '/playlists/remote-id/images',
        'access',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: 'base64-image',
        },
      ],
      ['/playlists/remote-id/images', 'access'],
    ]);
  });

  it('conserva query, limit, orden de IDs y paginación de tracks remotos', async () => {
    oauthApi.request
      .mockResolvedValueOnce({ tracks: { items: [{ id: 'found-track' }] } })
      .mockResolvedValueOnce({ tracks: [null, { id: 'found-track' }] })
      .mockResolvedValueOnce({
        items: [{ item: { uri: 'spotify:track:one' } }],
        next: 'next-page',
      })
      .mockResolvedValueOnce({
        items: [
          { track: { uri: 'spotify:track:one' } },
          { item: { uri: 'spotify:track:two' } },
        ],
        next: null,
      });

    await expect(
      service.searchTracks('access', 'artist:Band name', 20),
    ).resolves.toEqual([{ id: 'found-track' }]);
    await expect(service.getTracks('access', ['one', 'two'])).resolves.toEqual([
      null,
      { id: 'found-track' },
    ]);
    await expect(
      service.getPlaylistTrackUris('access', 'playlist-id', false),
    ).resolves.toEqual([
      'spotify:track:one',
      'spotify:track:one',
      'spotify:track:two',
    ]);
    expect(oauthApi.request).toHaveBeenNthCalledWith(
      1,
      '/search?q=artist%3ABand+name&type=track&limit=20',
      'access',
    );
    expect(oauthApi.request).toHaveBeenNthCalledWith(
      2,
      '/tracks?ids=one%2Ctwo',
      'access',
    );
    expect(oauthApi.request).toHaveBeenNthCalledWith(
      3,
      '/playlists/playlist-id/items?limit=50&offset=0',
      'access',
    );
    expect(oauthApi.request).toHaveBeenNthCalledWith(
      4,
      '/playlists/playlist-id/items?limit=50&offset=1',
      'access',
    );
  });

  it('mantiene los payloads de adición, eliminación y reemplazo por bloques de 100', async () => {
    const uris = Array.from(
      { length: 205 },
      (_, index) => `spotify:track:${index}`,
    );

    await service.addPlaylistItems('access', 'playlist-id', [
      'spotify:track:add',
    ]);
    await service.removePlaylistItems('access', 'playlist-id', [
      'spotify:track:remove',
    ]);
    await service.replacePlaylistTrackUris('access', 'playlist-id', uris);

    expect(oauthApi.request).toHaveBeenNthCalledWith(
      1,
      '/playlists/playlist-id/items',
      'access',
      { method: 'POST', body: JSON.stringify({ uris: ['spotify:track:add'] }) },
    );
    expect(oauthApi.request).toHaveBeenNthCalledWith(
      2,
      '/playlists/playlist-id/items',
      'access',
      {
        method: 'DELETE',
        body: JSON.stringify({ items: [{ uri: 'spotify:track:remove' }] }),
      },
    );
    expect(oauthApi.request).toHaveBeenNthCalledWith(
      3,
      '/playlists/playlist-id/items',
      'access',
      { method: 'PUT', body: JSON.stringify({ uris: uris.slice(0, 100) }) },
    );
    expect(oauthApi.request).toHaveBeenNthCalledWith(
      4,
      '/playlists/playlist-id/items',
      'access',
      { method: 'POST', body: JSON.stringify({ uris: uris.slice(100, 200) }) },
    );
    expect(oauthApi.request).toHaveBeenNthCalledWith(
      5,
      '/playlists/playlist-id/items',
      'access',
      { method: 'POST', body: JSON.stringify({ uris: uris.slice(200) }) },
    );
  });
});
