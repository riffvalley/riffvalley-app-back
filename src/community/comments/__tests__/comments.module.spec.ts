import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { User } from 'src/auth/entities/user.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { UserAccessLog } from 'src/auth/entities/user-access-log.entity';
import { Rate } from 'src/rates/entities/rate.entity';
import { Comment } from '../entities/comment.entity';
import { CommentsController } from '../comments.controller';
import { CommentsModule } from '../comments.module';
import { CommentsService } from '../comments.service';

describe('CommentsModule characterization', () => {
  let moduleRef: TestingModule;
  const commentRepository = {};
  const discRepository = {};

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [CommentsModule] })
      .overrideProvider(getRepositoryToken(Comment))
      .useValue(commentRepository)
      .overrideProvider(getRepositoryToken(Disc))
      .useValue(discRepository)
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(getRepositoryToken(UserAccessLog))
      .useValue({})
      .overrideProvider(getRepositoryToken(Rate))
      .useValue({})
      .overrideProvider(ConfigService)
      .useValue({ get: () => 'comments-test-secret' })
      .compile();
  });

  afterAll(async () => moduleRef?.close());

  it('resolves the controller, service and Comment repository through the module', () => {
    expect(moduleRef.get(CommentsController)).toBeDefined();
    const service = moduleRef.get(CommentsService) as any;
    expect(service).toBeDefined();
    expect(moduleRef.get(getRepositoryToken(Comment))).toBe(commentRepository);
    expect(service.commentRepository).toBe(commentRepository);
    expect(moduleRef.get(getRepositoryToken(Disc))).toBe(discRepository);

    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, CommentsModule) as unknown[];
    expect(imports).toContain(AuthModule);
  });

  it('preserves route methods, paths, and authentication on create and user list', () => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, CommentsController);
    expect(controllerPath).toBe('comments');

    const expectedRoutes = [
      ['create', RequestMethod.POST, '/', true],
      ['findAll', RequestMethod.GET, '/', true],
      ['findOne', RequestMethod.GET, ':id', false],
      ['update', RequestMethod.PATCH, ':id', false],
      ['remove', RequestMethod.DELETE, ':id', false],
      ['findCommentsByDisc', RequestMethod.GET, '/disc/:discId', false],
    ] as const;

    for (const [method, requestMethod, path, authenticated] of expectedRoutes) {
      const handler = CommentsController.prototype[method];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Boolean(Reflect.getMetadata(GUARDS_METADATA, handler))).toBe(authenticated);
      if (authenticated) expect(Reflect.getMetadata(META_ROLES, handler)).toEqual([]);
    }
  });

  it('preserves Comment relations and eager metadata', () => {
    const relations = getMetadataArgsStorage().relations;
    const relation = (target: Function, propertyName: string) =>
      relations.find((entry) => entry.target === target && entry.propertyName === propertyName);

    expect(relation(Comment, 'user')).toMatchObject({
      relationType: 'many-to-one',
      options: { eager: true, onDelete: 'CASCADE' },
    });
    expect(relation(Comment, 'disc')).toMatchObject({
      relationType: 'many-to-one',
      options: { onDelete: 'CASCADE' },
    });
    expect(relation(Comment, 'parent')).toMatchObject({
      relationType: 'many-to-one',
      options: { nullable: true, onDelete: 'CASCADE' },
    });
    expect(relation(Comment, 'replies')).toMatchObject({ relationType: 'one-to-many' });
    expect(relation(Comment, 'disc')?.options.eager).toBeUndefined();
    expect(relation(Comment, 'parent')?.options.eager).toBeUndefined();
    expect(relation(Comment, 'replies')?.options.eager).toBeUndefined();

    expect(relation(User, 'comments')).toMatchObject({
      relationType: 'one-to-many',
      options: { cascade: true },
    });
    expect(relation(Disc, 'comments')).toMatchObject({
      relationType: 'one-to-many',
      options: { eager: true },
    });
  });
});
