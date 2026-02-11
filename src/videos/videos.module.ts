import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { Video } from './entities/video.entity';
import { ContentsModule } from 'src/contents/contents.module';
import { ListsModule } from 'src/lists/list.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video]),
    forwardRef(() => ContentsModule),
    ListsModule,
  ],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService, TypeOrmModule],
})
export class VideosModule {}
