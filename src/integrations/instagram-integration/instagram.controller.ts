import { Controller, Get, Query } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { InstagramPostsQueryDto } from './dto/instagram-posts-query.dto';

@Controller('instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('posts')
  findPosts(@Query() dto: InstagramPostsQueryDto) {
    return this.instagramService.findPosts(dto);
  }
}
