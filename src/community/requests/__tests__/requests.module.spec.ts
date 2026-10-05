import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { AuthModule } from 'src/auth/auth.module';
import { User } from 'src/auth/entities/user.entity';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { UserAccessLog } from 'src/auth/entities/user-access-log.entity';
import { Rate } from 'src/rates/entities/rate.entity';
import { DiscRequest } from '../entities/disc-request.entity';
import { RequestsController } from '../requests.controller';
import { RequestsModule } from '../requests.module';
import { RequestsService } from '../requests.service';

describe('RequestsModule', () => {
  let moduleRef: TestingModule;
  let repositories: Map<Function, { entity: Function }>;

  beforeAll(async () => {
    const entities = [DiscRequest, Artist, Disc, Genre, Country, User, UserAccessLog, Rate];
    repositories = new Map(entities.map((entity) => [entity, { entity }] as const));
    const testingModule = Test.createTestingModule({ imports: [RequestsModule] })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn(() => 'requests-module-test-secret') });

    for (const entity of entities) {
      testingModule
        .overrideProvider(getRepositoryToken(entity))
        .useValue(repositories.get(entity));
    }

    moduleRef = await testingModule.compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('resolves Requests with its controller, service, AuthModule, and Catalog repositories', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, RequestsModule) as unknown[];
    const service = moduleRef.get(RequestsService) as unknown as Record<string, unknown>;

    expect(moduleRef.get(RequestsController)).toBeDefined();
    expect(imports).toContain(AuthModule);
    expect(service['requestRepo']).toBe(repositories.get(DiscRequest));
    expect(service['artistRepo']).toBe(repositories.get(Artist));
    expect(service['discRepo']).toBe(repositories.get(Disc));
    expect(service['genreRepo']).toBe(repositories.get(Genre));
    expect(service['countryRepo']).toBe(repositories.get(Country));
  });

  it('preserves route methods and the administrative role boundary', () => {
    const routes = [
      ['create', RequestMethod.POST, '/', []],
      ['findAll', RequestMethod.GET, '/', [ValidRoles.admin, ValidRoles.riffValley]],
      ['findMine', RequestMethod.GET, 'my', []],
      ['findOne', RequestMethod.GET, ':id', [ValidRoles.admin, ValidRoles.riffValley]],
      ['update', RequestMethod.PATCH, ':id', [ValidRoles.admin, ValidRoles.riffValley]],
      ['approve', RequestMethod.POST, ':id/approve', [ValidRoles.admin, ValidRoles.riffValley]],
      ['reopen', RequestMethod.POST, ':id/reopen', [ValidRoles.admin, ValidRoles.riffValley]],
      ['reject', RequestMethod.DELETE, ':id', [ValidRoles.admin, ValidRoles.riffValley]],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, RequestsController)).toBe('requests');
    for (const [methodName, method, path, roles] of routes) {
      const handler = RequestsController.prototype[methodName];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(META_ROLES, handler)).toEqual(roles);
    }
  });
});
