import { Controller, Get, Query } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ChannelPostsQueryDto } from './dto/channel-posts-query.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { ValidRoles } from '../auth/interfaces/valid-roles';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('channel-posts')
  @Auth(ValidRoles.user, ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  getChannelPosts(@Query() query: ChannelPostsQueryDto) {
    return this.telegramService.getChannelPosts(query.channel, query.limit);
  }
}
