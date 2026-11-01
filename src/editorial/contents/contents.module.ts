import { Module } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Content } from './entities/content.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { Point } from 'src/editorial/reunions/points/entities/point.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Article } from 'src/editorial/articles/entities/article.entity';
import { Video } from 'src/editorial/videos/entities/video.entity';
import { List } from 'src/editorial/lists/entities/list.entity';

import { ListsModule } from 'src/editorial/lists/list.module';
import { DiscModule } from 'src/catalog/discs/discs.module';

import { ContentSchedulerService } from './content-scheduler.service';

import { forwardRef } from '@nestjs/common';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { ContentQueryService } from './application/content-query.service';
import { ContentCreationService } from './application/content-creation.service';
import { ContentLifecycleService } from './application/content-lifecycle.service';
import { ContentCalendarRealtimeModule } from './realtime/content-calendar-realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Content,
      User,
      Reunion,
      Point,
      RiffValleyPlaylist,
      Article,
      Video,
      List,
    ]),
    forwardRef(() => ListsModule),
    ContentCalendarRealtimeModule,
    DiscModule,
    AuthorizationModule,
  ],
  controllers: [ContentsController],
  providers: [
    ContentsService,
    ContentSchedulerService,
    ContentQueryService,
    ContentCreationService,
    ContentLifecycleService,
  ],
  exports: [ContentsService, ContentCalendarRealtimeModule],
})
export class ContentsModule {}
