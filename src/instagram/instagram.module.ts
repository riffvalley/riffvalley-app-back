import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstagramPost } from './entities/instagram-post.entity';
import { InstagramService } from './instagram.service';
import { InstagramController } from './instagram.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InstagramPost])],
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
