import { Body, Controller, Post } from '@nestjs/common';
import { SocialService } from './social.service';
import { PublishPostDto } from './dto/publish-post.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('publish')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  publish(@Body() dto: PublishPostDto) {
    return this.socialService.publishAll(dto);
  }
}
