import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  Query,
  Headers,
} from '@nestjs/common';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { ListVideoQueryDto } from './dto/list-video.query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { toPublicContentReference } from 'src/editorial/contents/serialization/public-content-reference';
import { GetUser } from 'src/identity/authorization/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { contentCalendarMutationContext } from 'src/editorial/contents/realtime/contracts/content-calendar-event.contract';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createVideoDto: CreateVideoDto) {
    return this.videosService
      .create(createVideoDto)
      .then(toPublicContentReference);
  }

  @Get()
  findAll(@Query() query: ListVideoQueryDto) {
    return this.videosService
      .findAll(query)
      .then((videos) => videos.map(toPublicContentReference));
  }

  @Post(':id/list')
  @Auth(ValidRoles.riffvalley)
  createList(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.videosService.createListForVideo(id);
  }

  // Manual "create content" button: creates a backlog Content linked to
  // this Video. Video and Content stay independent from then on.
  @Post(':id/content')
  @Auth(ValidRoles.riffvalley)
  createContent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
    @Headers('x-content-calendar-client-id') legacySourceId?: string,
  ) {
    return this.videosService
      .createContentForVideo(
        id,
        contentCalendarMutationContext(user, sourceId ?? legacySourceId),
      )
      .then(toPublicContentReference);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.videosService.findOne(id).then(toPublicContentReference);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateVideoDto: UpdateVideoDto,
  ) {
    return this.videosService
      .update(id, updateVideoDto)
      .then(toPublicContentReference);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.videosService.remove(id);
  }
}
