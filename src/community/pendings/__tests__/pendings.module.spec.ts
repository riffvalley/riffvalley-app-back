import { RequestMethod, Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuthModule } from 'src/identity/auth/auth.module';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { UserAccessLog } from 'src/identity/auth/entities/user-access-log.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Rate } from 'src/community/rates/entities/rate.entity';
import { Pending } from '../entities/pending.entity';
import { PendingsController } from '../pendings.controller';
import { PendingsModule } from '../pendings.module';
import { PendingsService } from '../pendings.service';

describe('PendingsModule characterization', () => {
  let moduleRef: TestingModule;
  const pendingRepository = {};
  const discRepository = {};

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [PendingsModule] })
      .overrideProvider(getRepositoryToken(Pending))
      .useValue(pendingRepository)
      .overrideProvider(getRepositoryToken(Disc))
      .useValue(discRepository)
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserAccessLog))
      .useValue({})
      .overrideProvider(getRepositoryToken(Rate))
      .useValue({})
      .overrideProvider(ConfigService)
      .useValue({ get: () => 'pendings-test-secret' })
      .compile();
  });

  afterAll(async () => moduleRef?.close());

  it('resolves the controller, service and repositories through PendingsModule/AuthModule', () => {
    expect(moduleRef.get(PendingsController)).toBeDefined();
    const service = moduleRef.get(PendingsService);
    expect(service).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(Pending))).toBe(pendingRepository);
    expect(service).toHaveProperty('pendingRepository', pendingRepository);
    expect(moduleRef.get(getRepositoryToken(Disc))).toBe(discRepository);

    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      PendingsModule,
    ) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  it('preserves route methods, paths and the current authentication decorators', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PendingsController)).toBe(
      'pendings',
    );

    const expectedRoutes = [
      ['create', RequestMethod.POST, '/', true],
      ['findAll', RequestMethod.GET, '/', true],
      ['findOne', RequestMethod.GET, ':id', true],
      ['remove', RequestMethod.DELETE, ':id', true],
    ] as const;

    for (const [method, requestMethod, path, authenticated] of expectedRoutes) {
      const handler = PendingsController.prototype[method];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Boolean(Reflect.getMetadata(GUARDS_METADATA, handler))).toBe(
        authenticated,
      );
      if (authenticated) {
        expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
      }
    }
  });

  it('preserves Pending relation metadata and targets User.pending as its inverse', () => {
    const relations = getMetadataArgsStorage().relations;
    const relation = (target: Type<unknown>, propertyName: string) =>
      relations.find(
        (entry) =>
          entry.target === target && entry.propertyName === propertyName,
      );
    const inverseSide = (
      relationEntry: (typeof relations)[number] | undefined,
      entity: object,
    ) => {
      const inverseSideProperty = relationEntry?.inverseSideProperty;
      return typeof inverseSideProperty === 'function'
        ? inverseSideProperty(entity)
        : undefined;
    };

    const pendingUser = relation(Pending, 'user');
    expect(pendingUser).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true, onDelete: 'CASCADE' },
    });
    expect(inverseSide(pendingUser, { pending: 'pending' })).toBe('pending');

    const pendingDisc = relation(Pending, 'disc');
    expect(pendingDisc).toMatchObject({
      relationType: 'many-to-one',
      options: { onDelete: 'CASCADE' },
    });
    expect(pendingDisc?.options.eager).toBeUndefined();
    expect(inverseSide(pendingDisc, { pendings: 'pendings' })).toBe('pendings');

    const userPending = relation(User, 'pending');
    expect(userPending).toMatchObject({
      relationType: 'one-to-many',
      options: { cascade: true },
    });
    expect(inverseSide(userPending, { user: 'user' })).toBe('user');

    const discPendings = relation(Disc, 'pendings');
    expect(discPendings).toMatchObject({
      relationType: 'one-to-many',
      options: { eager: true },
    });
    expect(inverseSide(discPendings, { disc: 'disc' })).toBe('disc');
  });

  it('resolves Pending.user and User.pending as inverse sides of the same relation', async () => {
    class MetadataDataSource extends DataSource {
      buildMetadataForTest() {
        return this.buildMetadatas();
      }
    }

    const dataSource = new MetadataDataSource({
      type: 'postgres',
      entities: ['src/**/*.entity.ts'],
    });
    await dataSource.buildMetadataForTest();

    const pendingUser = dataSource
      .getMetadata(Pending)
      .findRelationWithPropertyPath('user');
    const userPending = dataSource
      .getMetadata(User)
      .findRelationWithPropertyPath('pending');

    expect(pendingUser?.inverseSidePropertyPath).toBe('pending');
    expect(pendingUser?.inverseRelation).toBe(userPending);
    expect(userPending?.inverseRelation).toBe(pendingUser);
    expect(
      pendingUser?.joinColumns.map((column) => column.databaseName),
    ).toEqual(['userId']);
    expect(pendingUser?.isEager).toBe(true);
    expect(pendingUser?.onDelete).toBe('CASCADE');
    expect(userPending?.isCascadeInsert).toBe(true);
  });
});
