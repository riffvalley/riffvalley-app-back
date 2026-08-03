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
import { SpotifyService } from './spotify.service';
import { CreateSpotifyDto } from './dto/create-spotify.dto';
import { UpdateSpotifyDto } from './dto/update-spotify.dto';
import { ListSpotifyQueryDto } from './dto/list-spotify.query.dto';

@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('spotify')
export class SpotifyController {
  constructor(private readonly spotifyService: SpotifyService) { }

  @Get('festivals')
  findFestivals(@Query() query: ListSpotifyQueryDto) {
    return this.spotifyService.findAll({ ...query, type: 'festival' });
  }

  @Get('genres')
  findGenres(@Query() query: ListSpotifyQueryDto) {
    return this.spotifyService.findAll({ ...query, type: ['genero', 'especial', 'otras'] });
  }

  @Get('genres/random')
  findRandomGenrePlaylist() {
    return this.spotifyService.findRandomGenrePlaylist();
  }

  @Post()
  create(@Body() createSpotifyDto: CreateSpotifyDto) {
    return this.spotifyService.create(createSpotifyDto);
  }

  @Get()
  findAll(@Query() query: ListSpotifyQueryDto) {
    return this.spotifyService.findAll(query);
  }



  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.spotifyService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateSpotifyDto: UpdateSpotifyDto,
  ) {
    return this.spotifyService.update(id, updateSpotifyDto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.spotifyService.remove(id);
  }
}
