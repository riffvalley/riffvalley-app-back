import { Controller, Get, Query } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ChannelPostsQueryDto } from './dto/channel-posts-query.dto';
import { TelegramPostsQueryDto } from './dto/telegram-posts-query.dto';
import { Auth } from '../../identity/auth/decorators/auth.decorator';
import { ValidRoles } from '../../identity/auth/interfaces/valid-roles';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('channel-posts')
  @Auth(ValidRoles.riffvalley)
  getChannelPosts(@Query() query: ChannelPostsQueryDto) {
    return this.telegramService.getChannelPosts(query.channel, query.limit);
  }

  @Get('posts')
  getPosts(@Query() query: TelegramPostsQueryDto) {
    return this.telegramService.getChannelPostsPage(
      query.channel,
      query.limit,
      query.before,
    );
  }
}
