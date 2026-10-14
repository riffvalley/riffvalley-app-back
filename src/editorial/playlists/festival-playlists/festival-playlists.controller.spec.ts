import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';
import { FestivalPlaylistsController } from './festival-playlists.controller';

describe('FestivalPlaylistsController authorization metadata', () => {
  const handler = (
    method: keyof typeof FestivalPlaylistsController.prototype,
  ) => FestivalPlaylistsController.prototype[method] as Function;

  it('restricts playlist and Spotify connection operations to riffvalley with inherited superadmin access', () => {
    const protectedRoutes = [
      ['connectSpotify', 1, 'spotify/connect'],
      ['getSpotifyConnection', 0, 'spotify/connection'],
      ['disconnectSpotify', 3, 'spotify/connection'],
      ['createFestivalPlaylist', 1, '/'],
      ['createLinkedFestivalPlaylist', 1, 'link'],
      ['linkExistingFestivalPlaylist', 1, ':riffValleyPlaylistId/link'],
      ['updateFestivalPlaylist', 4, ':riffValleyPlaylistId'],
      ['updateFestivalPlaylistImage', 2, ':riffValleyPlaylistId/image'],
      ['getFestivalPlaylist', 0, ':riffValleyPlaylistId'],
      ['addArtist', 1, ':riffValleyPlaylistId/artists'],
      [
        'searchArtistTracks',
        0,
        ':riffValleyPlaylistId/artists/:artistId/tracks',
      ],
      [
        'replaceFailedArtistTracks',
        2,
        ':riffValleyPlaylistId/artists/:artistId/tracks',
      ],
      ['clearFestivalPlaylist', 3, ':riffValleyPlaylistId/tracks'],
      ['removeArtist', 3, ':riffValleyPlaylistId/artists/:artistId'],
    ] as const;

    expect(
      Reflect.getMetadata(PATH_METADATA, FestivalPlaylistsController),
    ).toBe('festival-playlists');
    for (const [methodName, httpMethod, path] of protectedRoutes) {
      const routeHandler = handler(methodName);
      expect(Reflect.getMetadata(METHOD_METADATA, routeHandler)).toBe(
        httpMethod,
      );
      expect(Reflect.getMetadata(PATH_METADATA, routeHandler)).toBe(path);
      const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, routeHandler);
      expect(minimumRole).toBe(ValidRoles.riffvalley);
      expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
      expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(
        false,
      );
      expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(true);
      expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
      expect(Reflect.getMetadata(GUARDS_METADATA, routeHandler)).toContain(
        UserRoleGuard,
      );
    }
  });

  it('keeps top songs authenticated without a role filter and the Spotify callback public', () => {
    const topSongsHandler = handler('getTopSongs');
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, topSongsHandler),
    ).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, topSongsHandler)).toContain(
      UserRoleGuard,
    );

    const callbackHandler = handler('spotifyCallback');
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, callbackHandler),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, callbackHandler),
    ).toBeUndefined();
  });
});
