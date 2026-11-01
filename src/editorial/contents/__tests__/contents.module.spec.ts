import { PointsModule } from 'src/editorial/reunions/points/points.module';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Content } from '../entities/content.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { Point } from 'src/editorial/reunions/points/entities/point.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Article } from 'src/editorial/articles/entities/article.entity';
import { Video } from 'src/editorial/videos/entities/video.entity';
import { List } from 'src/editorial/lists/entities/list.entity';
import { ContentCreationService } from '../application/content-creation.service';
import { ContentQueryService } from '../application/content-query.service';
import { ContentLifecycleService } from '../application/content-lifecycle.service';
import { ContentsModule } from '../contents.module';
import { ContentCalendarEventsController } from '../realtime/content-calendar-events.controller';
import { ContentCalendarEventPublisher } from '../realtime/content-calendar-event-publisher.service';
import { ContentCalendarStreamService } from '../realtime/content-calendar-stream.service';
import { ContentCalendarRealtimeModule } from '../realtime/content-calendar-realtime.module';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';

describe('ContentsModule providers', () => {
  it('registers each internal service once and no longer imports PointsModule', () => {
    const providers: unknown = Reflect.getMetadata('providers', ContentsModule);
    const imports: unknown = Reflect.getMetadata('imports', ContentsModule);
    const controllers: unknown = Reflect.getMetadata(
      'controllers',
      ContentsModule,
    );
    const providerList = Array.isArray(providers) ? providers : [];
    const importList = Array.isArray(imports) ? imports : [];
    const controllerList = Array.isArray(controllers) ? controllers : [];

    expect(
      providerList.filter(
        (provider: unknown) => provider === ContentCreationService,
      ),
    ).toHaveLength(1);
    expect(
      providerList.filter(
        (provider: unknown) => provider === ContentQueryService,
      ),
    ).toHaveLength(1);
    expect(
      providerList.filter(
        (provider: unknown) => provider === ContentLifecycleService,
      ),
    ).toHaveLength(1);
    expect(providerList).not.toContain(ContentCalendarEventPublisher);
    expect(providerList).not.toContain(ContentCalendarStreamService);
    expect(controllerList).not.toContain(ContentCalendarEventsController);
    expect(importList).toContain(ContentCalendarRealtimeModule);
    expect(
      Reflect.getMetadata('imports', ContentCalendarRealtimeModule),
    ).toContain(AuthorizationModule);
    expect(
      Reflect.getMetadata('providers', ContentCalendarRealtimeModule),
    ).toContain(ContentCalendarEventPublisher);
    expect(
      Reflect.getMetadata('providers', ContentCalendarRealtimeModule),
    ).toContain(ContentCalendarStreamService);
    expect(
      Reflect.getMetadata('controllers', ContentCalendarRealtimeModule),
    ).toContain(ContentCalendarEventsController);
    expect(importList).not.toContain(PointsModule);

    const typeOrmFeature = importList.find(
      (module: unknown) =>
        typeof module === 'object' &&
        module !== null &&
        'module' in module &&
        module.module === TypeOrmModule,
    );
    const featureProviders =
      typeof typeOrmFeature === 'object' &&
      typeOrmFeature !== null &&
      'providers' in typeOrmFeature &&
      Array.isArray(typeOrmFeature.providers)
        ? typeOrmFeature.providers
        : [];
    const repositoryTokens = featureProviders.flatMap((provider: unknown) =>
      typeof provider === 'object' && provider !== null && 'provide' in provider
        ? [provider.provide]
        : [],
    );
    for (const entity of [
      Content,
      User,
      Reunion,
      Point,
      RiffValleyPlaylist,
      Article,
      Video,
      List,
    ]) {
      expect(repositoryTokens).toContain(getRepositoryToken(entity));
    }
  });
});
