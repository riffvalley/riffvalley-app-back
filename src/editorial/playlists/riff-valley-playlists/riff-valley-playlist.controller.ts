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
import { RiffValleyPlaylistService } from './riff-valley-playlist.service';
import { CreateRiffValleyPlaylistDto } from './dto/create-riff-valley-playlist.dto';
import { UpdateRiffValleyPlaylistDto } from './dto/update-riff-valley-playlist.dto';
import { ListRiffValleyPlaylistsQueryDto } from './dto/list-riff-valley-playlists.query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { toPublicContentReference } from 'src/editorial/contents/serialization/public-content-reference';
import { GetUser } from 'src/identity/authorization/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { contentCalendarMutationContext } from 'src/editorial/contents/realtime/contracts/content-calendar-event.contract';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('riff-valley-playlists')
export class RiffValleyPlaylistController {
  constructor(
    private readonly riffValleyPlaylistService: RiffValleyPlaylistService,
  ) {}

  @Get('festivals')
  findFestivals(@Query() query: ListRiffValleyPlaylistsQueryDto) {
    return this.riffValleyPlaylistService
      .findAll({ ...query, type: 'festival' })
      .then((playlists) => playlists.map(toPublicContentReference));
  }

  @Get('genres')
  findGenres(@Query() query: ListRiffValleyPlaylistsQueryDto) {
    return this.riffValleyPlaylistService
      .findAll({ ...query, type: ['genero', 'especial', 'otras'] })
      .then((playlists) => playlists.map(toPublicContentReference));
  }

  @Get('genres/random')
  findRandomGenrePlaylist() {
    return this.riffValleyPlaylistService.findRandomGenrePlaylist();
  }

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createRiffValleyPlaylistDto: CreateRiffValleyPlaylistDto) {
    return this.riffValleyPlaylistService
      .create(createRiffValleyPlaylistDto)
      .then(toPublicContentReference);
  }

  @Get()
  findAll(@Query() query: ListRiffValleyPlaylistsQueryDto) {
    return this.riffValleyPlaylistService
      .findAll(query)
      .then((playlists) => playlists.map(toPublicContentReference));
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.riffValleyPlaylistService
      .findOne(id)
      .then(toPublicContentReference);
  }

  // Manual "create content" button: creates a backlog Content linked to
  // this local playlist item. The playlist and Content stay independent from then on.
  @Post(':id/content')
  @Auth(ValidRoles.riffvalley)
  createContent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
    @Headers('x-content-calendar-client-id') legacySourceId?: string,
  ) {
    return this.riffValleyPlaylistService
      .createContentForRiffValleyPlaylist(
        id,
        contentCalendarMutationContext(user, sourceId ?? legacySourceId),
      )
      .then(toPublicContentReference);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateRiffValleyPlaylistDto: UpdateRiffValleyPlaylistDto,
  ) {
    return this.riffValleyPlaylistService
      .update(id, updateRiffValleyPlaylistDto)
      .then(toPublicContentReference);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.riffValleyPlaylistService.remove(id);
  }
}
