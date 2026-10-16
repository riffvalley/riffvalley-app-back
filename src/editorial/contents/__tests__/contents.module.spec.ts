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

describe('ContentsModule providers', () => {
  it('registers each internal service once and no longer imports PointsModule', () => {
    const providers = Reflect.getMetadata(
      'providers',
      ContentsModule,
    ) as unknown[];
    const imports = Reflect.getMetadata('imports', ContentsModule) as unknown[];

    expect(
      providers.filter((provider) => provider === ContentCreationService),
    ).toHaveLength(1);
    expect(
      providers.filter((provider) => provider === ContentQueryService),
    ).toHaveLength(1);
    expect(
      providers.filter((provider) => provider === ContentLifecycleService),
    ).toHaveLength(1);
    expect(imports).not.toContain(PointsModule);

    const typeOrmFeature = imports.find(
      (module: any) => module?.module === TypeOrmModule,
    ) as any;
    const repositoryTokens = typeOrmFeature.providers.map(
      (provider: any) => provider.provide,
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
