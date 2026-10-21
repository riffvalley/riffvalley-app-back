import { RequestMethod, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MODULE_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { Country } from 'src/catalog/countries/entities/country.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Genre } from 'src/catalog/genres/entities/genre.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { User } from 'src/identity/auth/entities/user.entity';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';
import { UserAccessLog } from 'src/identity/auth/entities/user-access-log.entity';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { DiscRequest } from '../entities/disc-request.entity';
import { RequestsController } from '../requests.controller';
import { RequestsModule } from '../requests.module';
import { RequestsService } from '../requests.service';

describe('RequestsModule', () => {
  let moduleRef: TestingModule;
  let repositories: Map<Type<unknown>, { entity: Type<unknown> }>;

  beforeAll(async () => {
    const entities = [
      DiscRequest,
      Artist,
      Disc,
      Genre,
      Country,
      User,
      UserAccessLog,
      Rate,
    ];
    repositories = new Map(
      entities.map((entity) => [entity, { entity }] as const),
    );
    const testingModule = Test.createTestingModule({
      imports: [RequestsModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn(() => 'requests-module-test-secret') })
      .useMocker((token) => (token === DataSource ? {} : undefined));

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

  it('resolves Requests with its controller, service, AuthorizationModule, and Catalog repositories', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      RequestsModule,
    ) as unknown[];
    const service = moduleRef.get(RequestsService);

    expect(moduleRef.get(RequestsController)).toBeDefined();
    expect(imports).toContain(AuthorizationModule);
    expect(service).toHaveProperty(
      'requestRepo',
      repositories.get(DiscRequest),
    );
    expect(service).toHaveProperty('artistRepo', repositories.get(Artist));
    expect(service).toHaveProperty('discRepo', repositories.get(Disc));
    expect(service).toHaveProperty('genreRepo', repositories.get(Genre));
    expect(service).toHaveProperty('countryRepo', repositories.get(Country));
  });

  it('preserves route methods and the administrative role boundary', () => {
    const routes: [
      keyof typeof RequestsController.prototype,
      RequestMethod,
      string,
      ValidRoles | undefined,
    ][] = [
      ['create', RequestMethod.POST, '/', undefined],
      ['findAll', RequestMethod.GET, '/', ValidRoles.riffvalley],
      ['findMine', RequestMethod.GET, 'my', undefined],
      ['findOne', RequestMethod.GET, ':id', ValidRoles.riffvalley],
      ['update', RequestMethod.PATCH, ':id', ValidRoles.riffvalley],
      ['approve', RequestMethod.POST, ':id/approve', ValidRoles.riffvalley],
      ['reopen', RequestMethod.POST, ':id/reopen', ValidRoles.riffvalley],
      ['reject', RequestMethod.DELETE, ':id', ValidRoles.riffvalley],
    ];

    expect(Reflect.getMetadata(PATH_METADATA, RequestsController)).toBe(
      'requests',
    );
    for (const [methodName, method, path, minimumRole] of routes) {
      const handler = RequestsController.prototype[methodName];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(minimumRole);

      if (minimumRole) {
        expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
        expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(
          false,
        );
        expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(true);
        expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
      }
    }
  });
});
