import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstagramPost } from './entities/instagram-post.entity';
import { InstagramService } from './instagram.service';
import { InstagramController } from './instagram.controller';
import { InstagramTokenStorageService } from './instagram-token-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([InstagramPost])],
  controllers: [InstagramController],
  providers: [InstagramService, InstagramTokenStorageService],
})
export class InstagramIntegrationModule {}
