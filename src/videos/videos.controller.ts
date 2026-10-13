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
} from '@nestjs/common';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { ListVideoQueryDto } from './dto/list-video.query.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createVideoDto: CreateVideoDto) {
    return this.videosService.create(createVideoDto);
  }

  @Get()
  findAll(@Query() query: ListVideoQueryDto) {
    return this.videosService.findAll(query);
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
  createContent(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.videosService.createContentForVideo(id);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.videosService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateVideoDto: UpdateVideoDto,
  ) {
    return this.videosService.update(id, updateVideoDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.videosService.remove(id);
  }
}
