import { Module } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Content } from './entities/content.entity';
import { User } from 'src/auth/entities/user.entity';
import { Reunion } from 'src/reunions/entities/reunion.entity';
import { Spotify } from 'src/spotify/entities/spotify.entity';
import { Article } from 'src/articles/entities/article.entity';
import { Video } from 'src/videos/entities/video.entity';
import { Disc } from 'src/discs/entities/disc.entity';
import { List } from 'src/lists/entities/list.entity';

import { ListsModule } from 'src/lists/list.module';
import { PointsModule } from 'src/points/points.module';

import { ContentSchedulerService } from './content-scheduler.service';

import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Content,
      User,
      Reunion,
      Spotify,
      Article,
      Video,
      Disc,
      List,
    ]),
    forwardRef(() => ListsModule),
    PointsModule,
  ],
  controllers: [ContentsController],
  providers: [ContentsService, ContentSchedulerService],
  exports: [ContentsService],
})
export class ContentsModule {}
