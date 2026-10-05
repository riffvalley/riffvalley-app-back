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
import { RiffValleyPlaylistService } from './riff-valley-playlist.service';
import { CreateRiffValleyPlaylistDto } from './dto/create-riff-valley-playlist.dto';
import { UpdateRiffValleyPlaylistDto } from './dto/update-riff-valley-playlist.dto';
import { ListRiffValleyPlaylistsQueryDto } from './dto/list-riff-valley-playlists.query.dto';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('riff-valley-playlists')
export class RiffValleyPlaylistController {
  constructor(private readonly riffValleyPlaylistService: RiffValleyPlaylistService) {}

  @Get('festivals')
  findFestivals(@Query() query: ListRiffValleyPlaylistsQueryDto) {
    return this.riffValleyPlaylistService.findAll({ ...query, type: 'festival' });
  }

  @Get('genres')
  findGenres(@Query() query: ListRiffValleyPlaylistsQueryDto) {
    return this.riffValleyPlaylistService.findAll({ ...query, type: ['genero', 'especial', 'otras'] });
  }

  @Get('genres/random')
  findRandomGenrePlaylist() {
    return this.riffValleyPlaylistService.findRandomGenrePlaylist();
  }

  @Post()
  create(@Body() createRiffValleyPlaylistDto: CreateRiffValleyPlaylistDto) {
    return this.riffValleyPlaylistService.create(createRiffValleyPlaylistDto);
  }

  @Get()
  findAll(@Query() query: ListRiffValleyPlaylistsQueryDto) {
    return this.riffValleyPlaylistService.findAll(query);
  }



  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.riffValleyPlaylistService.findOne(id);
  }

  // Manual "create content" button: creates a backlog Content linked to
  // this local playlist item. The playlist and Content stay independent from then on.
  @Post(':id/content')
  createContent(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.riffValleyPlaylistService.createContentForRiffValleyPlaylist(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateRiffValleyPlaylistDto: UpdateRiffValleyPlaylistDto,
  ) {
    return this.riffValleyPlaylistService.update(id, updateRiffValleyPlaylistDto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.riffValleyPlaylistService.remove(id);
  }
}
