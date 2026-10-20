import { Test } from '@nestjs/testing';
import {
  DynamicModule,
  ForwardReference,
  InjectionToken,
} from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { ContentCreationService } from 'src/editorial/contents/application/content-creation.service';
import { ContentLifecycleService } from 'src/editorial/contents/application/content-lifecycle.service';
import { ContentQueryService } from 'src/editorial/contents/application/content-query.service';
import { ContentsModule } from 'src/editorial/contents/contents.module';
import { AppModule } from 'src/app.module';
import { User } from 'src/identity/auth/entities/user.entity';
import { Article } from 'src/editorial/articles/entities/article.entity';
import { Video } from 'src/editorial/videos/entities/video.entity';
import { List } from 'src/editorial/lists/entities/list.entity';
import { ListsService } from 'src/editorial/lists/list.service';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { ContentsService } from 'src/editorial/contents/contents.service';
import { Point } from '../points/entities/point.entity';
import { PointController } from '../points/points.controller';
import { PointsModule } from '../points/points.module';
import { PointService } from '../points/points.service';
import { Reunion } from '../entities/reunion.entity';
import { ReunionController } from '../reunions.controller';
import { ReunionsModule } from '../reunions.module';
import { ReunionService } from '../reunions.service';

jest.mock('sanitize-html', () => jest.fn());

type ModuleClass = abstract new (...args: never[]) => unknown;

const moduleImports = (module: ModuleClass): unknown[] => {
  const imports: unknown = Reflect.getMetadata('imports', module);
  return Array.isArray(imports) ? imports : [];
};

const isDynamicModule = (value: unknown): value is DynamicModule =>
  typeof value === 'object' && value !== null && 'module' in value;

const featureFor = (module: ModuleClass): DynamicModule | undefined =>
  moduleImports(module).find(
    (entry): entry is DynamicModule =>
      isDynamicModule(entry) && entry.module === TypeOrmModule,
  );

const isInjectionToken = (value: unknown): value is InjectionToken =>
  typeof value === 'string' ||
  typeof value === 'symbol' ||
  typeof value === 'function';

const isProviderWithToken = (
  value: unknown,
): value is { provide: InjectionToken } =>
  typeof value === 'object' &&
  value !== null &&
  'provide' in value &&
  isInjectionToken(value.provide);

const providerTokens = (feature: DynamicModule | undefined): InjectionToken[] =>
  (feature?.providers ?? []).flatMap((provider) =>
    isProviderWithToken(provider) ? [provider.provide] : [],
  );

const isForwardReference = (value: unknown): value is ForwardReference =>
  typeof value === 'object' &&
  value !== null &&
  'forwardRef' in value &&
  typeof value.forwardRef === 'function';

describe('Reunions and Points NestJS wiring', () => {
  it('registers each service and controller once with the expected repository tokens', () => {
    const reunionProviders: unknown = Reflect.getMetadata(
      'providers',
      ReunionsModule,
    );
    const pointProviders: unknown = Reflect.getMetadata(
      'providers',
      PointsModule,
    );
    const reunionControllers: unknown = Reflect.getMetadata(
      'controllers',
      ReunionsModule,
    );
    const pointControllers: unknown = Reflect.getMetadata(
      'controllers',
      PointsModule,
    );

    expect(
      (Array.isArray(reunionProviders) ? reunionProviders : []).filter(
        (provider) => provider === ReunionService,
      ),
    ).toHaveLength(1);
    expect(
      (Array.isArray(pointProviders) ? pointProviders : []).filter(
        (provider) => provider === PointService,
      ),
    ).toHaveLength(1);
    expect(Array.isArray(reunionControllers) ? reunionControllers : []).toEqual(
      [ReunionController],
    );
    expect(Array.isArray(pointControllers) ? pointControllers : []).toEqual([
      PointController,
    ]);

    const reunionTokens = providerTokens(featureFor(ReunionsModule));
    const pointTokens = providerTokens(featureFor(PointsModule));
    expect(reunionTokens).toContain(getRepositoryToken(Reunion));
    expect(reunionTokens).toContain(getRepositoryToken(Content));
    expect(pointTokens).toContain(getRepositoryToken(Point));
    expect(pointTokens).toContain(getRepositoryToken(Reunion));

    const appImports: unknown = Reflect.getMetadata('imports', AppModule);
    const appImportEntries = Array.isArray(appImports) ? appImports : [];
    expect(
      appImportEntries.filter((entry) => entry === ReunionsModule),
    ).toHaveLength(1);
    expect(
      appImportEntries.filter((entry) => entry === PointsModule),
    ).toHaveLength(1);

    expect(moduleImports(PointsModule)).not.toContain(ReunionsModule);
    expect(moduleImports(PointsModule).some(isForwardReference)).toBe(false);
    expect(moduleImports(ReunionsModule)).toContain(ContentsModule);
    expect(moduleImports(ReunionsModule).some(isForwardReference)).toBe(false);
    const reunionDependencies: unknown = Reflect.getMetadata(
      'design:paramtypes',
      ReunionService,
    );
    expect(
      Array.isArray(reunionDependencies) ? reunionDependencies[2] : undefined,
    ).toBe(ContentsService);
  });

  it('keeps Contents as the consumer for coordinated Reunion and Point writes', () => {
    const contentsImports = moduleImports(ContentsModule);
    const feature = featureFor(ContentsModule);
    const repositoryTokens = providerTokens(feature);
    const providers: unknown = Reflect.getMetadata('providers', ContentsModule);
    const providerEntries = Array.isArray(providers) ? providers : [];

    expect(repositoryTokens).toContain(getRepositoryToken(Reunion));
    expect(repositoryTokens).toContain(getRepositoryToken(Point));
    expect(
      providerEntries.filter((provider) => provider === ContentCreationService),
    ).toHaveLength(1);
    expect(
      providerEntries.filter(
        (provider) => provider === ContentLifecycleService,
      ),
    ).toHaveLength(1);
    expect(contentsImports).not.toContain(PointsModule);

    expect(moduleImports(ReunionsModule)).toContain(ContentsModule);
  });

  it('compiles the services with mocked repositories and the current consumers', async () => {
    const entities = [
      Content,
      User,
      Reunion,
      Point,
      RiffValleyPlaylist,
      Article,
      Video,
      List,
    ];
    const repositoryProviders = entities.map((entity) => ({
      provide: getRepositoryToken(entity),
      useValue: {},
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReunionService,
        PointService,
        ContentCreationService,
        ContentLifecycleService,
        ...repositoryProviders,
        { provide: ContentsService, useValue: { remove: jest.fn() } },
        { provide: ListsService, useValue: {} },
        { provide: ContentQueryService, useValue: {} },
      ],
    }).compile();

    expect(moduleRef.get(ReunionService)).toBeInstanceOf(ReunionService);
    expect(moduleRef.get(PointService)).toBeInstanceOf(PointService);
    expect(moduleRef.get(ContentCreationService)).toBeInstanceOf(
      ContentCreationService,
    );
    expect(moduleRef.get(ContentLifecycleService)).toBeInstanceOf(
      ContentLifecycleService,
    );
    await moduleRef.close();
  });

  it('preserves database cascade metadata from Reunion to Points', () => {
    const relations = getMetadataArgsStorage().relations;
    const reunionPoints = relations.find(
      (relation) =>
        relation.target === Reunion && relation.propertyName === 'points',
    );
    const pointReunion = relations.find(
      (relation) =>
        relation.target === Point && relation.propertyName === 'reunion',
    );

    expect(reunionPoints?.options).toMatchObject({ cascade: true });
    expect(pointReunion?.options).toMatchObject({ onDelete: 'CASCADE' });
  });
});
