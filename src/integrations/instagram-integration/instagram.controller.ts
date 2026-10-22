import { Controller, Get, Query } from '@nestjs/common';
import { InstagramPostsQueryDto } from './dto/instagram-posts-query.dto';
import { InstagramService } from './instagram.service';

@Controller('instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('posts')
  findPosts(@Query() dto: InstagramPostsQueryDto) {
    return this.instagramService.findPosts(dto);
  }
}
