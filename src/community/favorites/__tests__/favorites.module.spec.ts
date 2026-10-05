import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { User } from 'src/auth/entities/user.entity';
import { UserAccessLog } from 'src/auth/entities/user-access-log.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Rate } from 'src/rates/entities/rate.entity';
import { Favorite } from '../entities/favorite.entity';
import { FavoritesController } from '../favorites.controller';
import { FavoritesModule } from '../favorites.module';
import { FavoritesService } from '../favorites.service';

describe('FavoritesModule characterization', () => {
  let moduleRef: TestingModule;
  const favoriteRepository = {};
  const discRepository = {};

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [FavoritesModule] })
      .overrideProvider(getRepositoryToken(Favorite))
      .useValue(favoriteRepository)
      .overrideProvider(getRepositoryToken(Disc))
      .useValue(discRepository)
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserAccessLog))
      .useValue({})
      .overrideProvider(getRepositoryToken(Rate))
      .useValue({})
      .overrideProvider(ConfigService)
      .useValue({ get: () => 'favorites-test-secret' })
      .compile();
  });

  afterAll(async () => moduleRef?.close());

  it('resolves the controller, service and repositories through FavoritesModule/AuthModule', () => {
    expect(moduleRef.get(FavoritesController)).toBeDefined();
    const service = moduleRef.get(FavoritesService) as any;
    expect(service).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(Favorite))).toBe(favoriteRepository);
    expect(service.favoriteRepository).toBe(favoriteRepository);
    expect(moduleRef.get(getRepositoryToken(Disc))).toBe(discRepository);

    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, FavoritesModule) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  it('preserves route methods, paths and the current authentication decorators', () => {
    expect(Reflect.getMetadata(PATH_METADATA, FavoritesController)).toBe('favorites');

    const expectedRoutes = [
      ['findAll', RequestMethod.GET, '/', true],
      ['create', RequestMethod.POST, '/', true],
      ['findOne', RequestMethod.GET, ':id', false],
      ['remove', RequestMethod.DELETE, ':id', false],
    ] as const;

    for (const [method, requestMethod, path, authenticated] of expectedRoutes) {
      const handler = FavoritesController.prototype[method];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Boolean(Reflect.getMetadata(GUARDS_METADATA, handler))).toBe(authenticated);
      if (authenticated) expect(Reflect.getMetadata(META_ROLES, handler)).toEqual([]);
    }
  });
});
