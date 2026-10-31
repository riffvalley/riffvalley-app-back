import { ForbiddenException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { UserRoleGuard } from '../guards/user-role/user-role.guard';
import { META_MINIMUM_ROLE } from '../decorators/role-protected.decorator';
import { Reflector } from '@nestjs/core';
import { ValidRoles } from '../interfaces/valid-roles';
import { ArticlesController } from 'src/editorial/articles/articles.controller';
import { AsignationsController } from 'src/editorial/lists/asignations/asignations.controller';
import { ArtistsController } from 'src/catalog/artists/artists.controller';
import { CountriesController } from 'src/catalog/countries/countries.controller';
import { DiscsController } from 'src/catalog/discs/discs.controller';
import { GenresController } from 'src/catalog/genres/genres.controller';
import { ContentsController } from 'src/editorial/contents/contents.controller';
import { ListsController } from 'src/editorial/lists/list.controller';
import { PointController } from 'src/editorial/reunions/points/points.controller';
import { ReunionController } from 'src/editorial/reunions/reunions.controller';
import { RiffValleyPlaylistController } from 'src/editorial/playlists/riff-valley-playlists/riff-valley-playlist.controller';
import { VersionsController } from 'src/product/versions/versions.controller';
import { VideosController } from 'src/editorial/videos/videos.controller';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

jest.mock('sanitize-html', () => jest.fn());

type ControllerConstructor = {
  new (...args: never[]): object;
  readonly prototype: object;
  readonly name: string;
};

type MutationRow = readonly [
  ControllerConstructor,
  string,
  string,
  number,
  ValidRoles,
];

type Mutation = {
  controller: ControllerConstructor;
  method: string;
  path: string;
  httpMethod: number;
  minimum: ValidRoles;
};

type RouteHandler = (...args: never[]) => unknown;

function isRouteHandler(value: unknown): value is RouteHandler {
  return typeof value === 'function';
}

function getHandler(mutation: Mutation): RouteHandler {
  const handler: unknown = Reflect.get(
    mutation.controller.prototype,
    mutation.method,
  );
  if (!isRouteHandler(handler)) {
    throw new Error(
      `Missing route handler ${mutation.controller.name}.${mutation.method}`,
    );
  }
  return handler;
}

const riffvalley = ValidRoles.riffvalley;
const superadmin = ValidRoles.superadmin;

const mutationRows: readonly MutationRow[] = [
  [ArticlesController, 'create', '/', 1, riffvalley],
  [ArticlesController, 'createContent', ':id/content', 1, riffvalley],
  [ArticlesController, 'update', ':id', 4, riffvalley],
  [ArticlesController, 'remove', ':id', 3, riffvalley],
  [AsignationsController, 'update', ':id', 4, riffvalley],
  [AsignationsController, 'remove', ':id', 3, riffvalley],
  [ArtistsController, 'create', '/', 1, riffvalley],
  [ArtistsController, 'update', ':id', 4, riffvalley],
  [CountriesController, 'create', '/', 1, riffvalley],
  [CountriesController, 'update', ':id', 4, riffvalley],
  [CountriesController, 'remove', ':id', 3, riffvalley],
  [DiscsController, 'create', '/', 1, riffvalley],
  [DiscsController, 'update', ':id', 4, riffvalley],
  [DiscsController, 'remove', ':id', 3, riffvalley],
  [GenresController, 'create', '/', 1, riffvalley],
  [GenresController, 'bulkCreate', 'bultCreateGenre', 1, riffvalley],
  [GenresController, 'update', ':id', 4, riffvalley],
  [GenresController, 'remove', ':id', 3, riffvalley],
  [ContentsController, 'create', '/', 1, riffvalley],
  [ContentsController, 'findAll', '/', 0, riffvalley],
  [ContentsController, 'findOne', ':id', 0, riffvalley],
  [ContentsController, 'findByMonth', 'by-month', 0, riffvalley],
  [ContentsController, 'update', ':id', 4, riffvalley],
  [ContentsController, 'remove', ':id', 3, riffvalley],
  [ListsController, 'create', '/', 1, riffvalley],
  [ListsController, 'createWeekly', 'weekly/create', 1, riffvalley],
  [ListsController, 'update', ':id', 4, riffvalley],
  [ListsController, 'removeList', ':id', 3, riffvalley],
  [PointController, 'create', '/', 1, riffvalley],
  [PointController, 'update', ':id', 4, riffvalley],
  [PointController, 'remove', ':id', 3, riffvalley],
  [ReunionController, 'create', '/', 1, riffvalley],
  [ReunionController, 'update', ':id', 4, riffvalley],
  [ReunionController, 'remove', ':id', 3, riffvalley],
  [RiffValleyPlaylistController, 'create', '/', 1, riffvalley],
  [RiffValleyPlaylistController, 'createContent', ':id/content', 1, riffvalley],
  [RiffValleyPlaylistController, 'update', ':id', 4, riffvalley],
  [RiffValleyPlaylistController, 'remove', ':id', 3, riffvalley],
  [VersionsController, 'create', '/', 1, superadmin],
  [VersionsController, 'createIndependentItem', 'items', 1, superadmin],
  [VersionsController, 'updateIndependentItem', 'items/:itemId', 4, superadmin],
  [VersionsController, 'removeIndependentItem', 'items/:itemId', 3, superadmin],
  [VersionsController, 'update', ':id', 4, superadmin],
  [VersionsController, 'remove', ':id', 3, superadmin],
  [VersionsController, 'createItem', ':versionId/items', 1, superadmin],
  [VersionsController, 'updateItem', ':versionId/items/:itemId', 4, superadmin],
  [VersionsController, 'removeItem', ':versionId/items/:itemId', 3, superadmin],
  [VersionsController, 'setActive', ':id/active', 4, superadmin],
  [VideosController, 'create', '/', 1, riffvalley],
  [VideosController, 'createList', ':id/list', 1, riffvalley],
  [VideosController, 'createContent', ':id/content', 1, riffvalley],
  [VideosController, 'update', ':id', 4, riffvalley],
  [VideosController, 'remove', ':id', 3, riffvalley],
];

const mutations: Mutation[] = mutationRows.map(
  ([controller, method, path, httpMethod, minimum]) => ({
    controller,
    method,
    path,
    httpMethod,
    minimum,
  }),
);

describe('domain mutation authorization', () => {
  const controllerPaths = new Map<ControllerConstructor, string>([
    [ArticlesController, 'articles'],
    [AsignationsController, 'asignations'],
    [ArtistsController, 'artists'],
    [CountriesController, 'countries'],
    [DiscsController, 'discs'],
    [GenresController, 'genres'],
    [ContentsController, 'contents'],
    [ListsController, 'lists'],
    [PointController, 'points'],
    [ReunionController, 'reunions'],
    [RiffValleyPlaylistController, 'riff-valley-playlists'],
    [VersionsController, 'versions'],
    [VideosController, 'videos'],
  ]);

  it.each(mutations)(
    '$controller.name.$method keeps its route and requires $minimum',
    (mutation) => {
      const handler = getHandler(mutation);
      expect(Reflect.getMetadata(PATH_METADATA, mutation.controller)).toBe(
        controllerPaths.get(mutation.controller),
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(mutation.path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        mutation.httpMethod,
      );
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        mutation.minimum,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        UserRoleGuard,
      );
      if (
        mutation.controller === ContentsController &&
        mutation.httpMethod === 0
      ) {
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toHaveLength(2);
      }
    },
  );

  it.each(mutations)(
    '$controller.name.$method denies roles below its minimum and allows its minimum and superadmin',
    async (mutation) => {
      const usersService = { findIdentityById: jest.fn() };
      const guard = new UserRoleGuard(new Reflector(), usersService as never);
      const handler = getHandler(mutation);
      const contextFor = (role: ValidRoles) =>
        new ExecutionContextHost(
          [{ user: { id: 'user-id', username: 'test-user', role } }],
          mutation.controller,
          handler,
        );

      for (const role of [ValidRoles.user, ValidRoles.collaborator]) {
        usersService.findIdentityById.mockResolvedValue({
          role,
          isActive: true,
        });
        await expect(
          guard.canActivate(contextFor(role)),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }

      for (const role of [mutation.minimum, ValidRoles.superadmin]) {
        usersService.findIdentityById.mockResolvedValue({
          role,
          isActive: true,
        });
        await expect(guard.canActivate(contextFor(role))).resolves.toBe(true);
      }
    },
  );
});
