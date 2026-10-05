import { RequestMethod } from '@nestjs/common';
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
import { AuthModule } from 'src/auth/auth.module';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { User } from 'src/auth/entities/user.entity';
import { UserAccessLog } from 'src/auth/entities/user-access-log.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Rate } from 'src/rates/entities/rate.entity';
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
    const service = moduleRef.get(PendingsService) as any;
    expect(service).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(Pending))).toBe(pendingRepository);
    expect(service.pendingRepository).toBe(pendingRepository);
    expect(moduleRef.get(getRepositoryToken(Disc))).toBe(discRepository);

    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, PendingsModule) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  it('preserves route methods, paths and the current authentication decorators', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PendingsController)).toBe('pendings');

    const expectedRoutes = [
      ['create', RequestMethod.POST, '/', true],
      ['findAll', RequestMethod.GET, '/', true],
      ['findOne', RequestMethod.GET, ':id', false],
      ['remove', RequestMethod.DELETE, ':id', false],
    ] as const;

    for (const [method, requestMethod, path, authenticated] of expectedRoutes) {
      const handler = PendingsController.prototype[method];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Boolean(Reflect.getMetadata(GUARDS_METADATA, handler))).toBe(authenticated);
      if (authenticated) expect(Reflect.getMetadata(META_ROLES, handler)).toEqual([]);
    }
  });

  it('preserves Pending relation metadata, including the existing user.rate inverse', () => {
    const relations = getMetadataArgsStorage().relations;
    const relation = (target: Function, propertyName: string) =>
      relations.find((entry) => entry.target === target && entry.propertyName === propertyName);

    const pendingUser = relation(Pending, 'user');
    expect(pendingUser).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true, onDelete: 'CASCADE' },
    });
    expect((pendingUser as any).inverseSideProperty({ rate: 'rate' })).toBe('rate');

    const pendingDisc = relation(Pending, 'disc');
    expect(pendingDisc).toMatchObject({
      relationType: 'many-to-one',
      options: { onDelete: 'CASCADE' },
    });
    expect(pendingDisc?.options.eager).toBeUndefined();
    expect((pendingDisc as any).inverseSideProperty({ pendings: 'pendings' })).toBe('pendings');

    const userPending = relation(User, 'pending');
    expect(userPending).toMatchObject({
      relationType: 'one-to-many',
      options: { cascade: true },
    });
    expect((userPending as any).inverseSideProperty({ user: 'user' })).toBe('user');

    const discPendings = relation(Disc, 'pendings');
    expect(discPendings).toMatchObject({
      relationType: 'one-to-many',
      options: { eager: true },
    });
    expect((discPendings as any).inverseSideProperty({ disc: 'disc' })).toBe('disc');
  });
});
