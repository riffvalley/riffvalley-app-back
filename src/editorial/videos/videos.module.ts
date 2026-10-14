import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { Video } from './entities/video.entity';
import { ContentsModule } from 'src/editorial/contents/contents.module';
import { ListsModule } from 'src/editorial/lists/list.module';
import { AuthModule } from 'src/identity/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video]),
    forwardRef(() => ContentsModule),
    ListsModule,
    AuthModule,
  ],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService, TypeOrmModule],
})
export class VideosModule {}
