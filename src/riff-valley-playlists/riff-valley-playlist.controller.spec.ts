import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RiffValleyPlaylistController } from './riff-valley-playlist.controller';
import { RiffValleyPlaylistModule } from './riff-valley-playlist.module';
import { SpotifyIntegrationModule } from 'src/spotify-integration/spotify-integration.module';
import { SpotifyArtistsController } from 'src/spotify-integration/http/spotify-artists.controller';
import { SpotifyAlbumsController } from 'src/spotify-integration/http/spotify-albums.controller';

describe('RiffValleyPlaylist HTTP ownership', () => {
  it('owns the new local resource route and CRUD endpoints', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, RiffValleyPlaylistController),
    ).toBe('riff-valley-playlists');
    for (const method of [
      'findAll',
      'findOne',
      'create',
      'update',
      'remove',
      'findFestivals',
      'findGenres',
      'findRandomGenrePlaylist',
      'createContent',
    ]) {
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          RiffValleyPlaylistController.prototype[method],
        ),
      ).toBeDefined();
      expect(
        Reflect.getMetadata(
          METHOD_METADATA,
          RiffValleyPlaylistController.prototype[method],
        ),
      ).toBeDefined();
    }
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        RiffValleyPlaylistModule,
      ),
    ).toContain(RiffValleyPlaylistController);
  });

  it('keeps external Spotify controllers in SpotifyIntegrationModule without the local CRUD controller', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      SpotifyIntegrationModule,
    ) as unknown[];
    expect(controllers).toContain(SpotifyArtistsController);
    expect(controllers).toContain(SpotifyAlbumsController);
    expect(controllers).not.toContain(RiffValleyPlaylistController);
  });
});
