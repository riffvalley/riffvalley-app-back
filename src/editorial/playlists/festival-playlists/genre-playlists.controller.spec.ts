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
import { GenrePlaylistsController } from './genre-playlists.controller';

describe('GenrePlaylistsController authorization metadata', () => {
  const handler = (method: keyof typeof GenrePlaylistsController.prototype) =>
    GenrePlaylistsController.prototype[method] as Function;

  it('restricts all playlist operations to riffvalley with inherited superadmin access', () => {
    const protectedRoutes = [
      ['create', 1, '/'],
      ['createLinked', 1, 'link'],
      ['linkExisting', 1, ':riffValleyPlaylistId/link'],
      ['getPlaylist', 0, ':riffValleyPlaylistId'],
      ['updatePlaylist', 4, ':riffValleyPlaylistId'],
      ['updateImage', 2, ':riffValleyPlaylistId/image'],
      ['searchTracks', 0, ':riffValleyPlaylistId/artists/:artistId/tracks'],
      ['addArtist', 1, ':riffValleyPlaylistId/artists'],
      ['replaceTracks', 2, ':riffValleyPlaylistId/artists/:artistId/tracks'],
      ['removeArtist', 3, ':riffValleyPlaylistId/artists/:artistId'],
      ['clear', 3, ':riffValleyPlaylistId/tracks'],
      ['shuffle', 1, ':riffValleyPlaylistId/shuffle'],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, GenrePlaylistsController)).toBe(
      'genre-playlists',
    );
    const minimumRole = Reflect.getMetadata(
      META_MINIMUM_ROLE,
      GenrePlaylistsController,
    );
    expect(minimumRole).toBe(ValidRoles.riffvalley);
    expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(true);
    expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, GenrePlaylistsController),
    ).toContain(UserRoleGuard);

    for (const [methodName, httpMethod, path] of protectedRoutes) {
      const routeHandler = handler(methodName);
      expect(Reflect.getMetadata(METHOD_METADATA, routeHandler)).toBe(
        httpMethod,
      );
      expect(Reflect.getMetadata(PATH_METADATA, routeHandler)).toBe(path);
    }
  });
});
