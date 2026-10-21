import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentsModule } from 'src/editorial/contents/contents.module';
import { AuthModule } from 'src/identity/auth/auth.module';
import { User } from 'src/identity/auth/entities/user.entity';
import { RiffValleyPlaylist } from './entities/riff-valley-playlist.entity';
import { RiffValleyPlaylistController } from './riff-valley-playlist.controller';
import { RiffValleyPlaylistService } from './riff-valley-playlist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RiffValleyPlaylist, User]),
    ContentsModule,
    AuthModule,
  ],
  controllers: [RiffValleyPlaylistController],
  providers: [RiffValleyPlaylistService],
})
export class RiffValleyPlaylistModule {}
