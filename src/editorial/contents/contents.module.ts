import { Module } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Content } from './entities/content.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { RiffValleyPlaylist } from 'src/editorial/playlists/riff-valley-playlists/entities/riff-valley-playlist.entity';
import { Article } from 'src/editorial/articles/entities/article.entity';
import { Video } from 'src/editorial/videos/entities/video.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { List } from 'src/editorial/lists/entities/list.entity';

import { ListsModule } from 'src/editorial/lists/list.module';
import { PointsModule } from 'src/editorial/reunions/points/points.module';

import { ContentSchedulerService } from './content-scheduler.service';

import { forwardRef } from '@nestjs/common';
import { SpotifyIntegrationModule } from 'src/integrations/spotify-integration/spotify-integration.module';
import { AuthModule } from 'src/identity/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Content,
      User,
      Reunion,
      RiffValleyPlaylist,
      Article,
      Video,
      Disc,
      List,
    ]),
    forwardRef(() => ListsModule),
    PointsModule,
    SpotifyIntegrationModule,
    AuthModule,
  ],
  controllers: [ContentsController],
  providers: [ContentsService, ContentSchedulerService],
  exports: [ContentsService],
})
export class ContentsModule {}
