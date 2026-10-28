import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { DiscsService } from './discs.service';
import { CreateDiscDto } from './dto/create-discs.dto';
import { CreateDiscWithArtistDto } from './dto/create-disc-with-artist.dto';
import { UpdateDiscDto } from './dto/update-discs.dto';
import { DiscsCalendarQueryDto } from './dto/discs-calendar-query.dto';
import { DiscsListQueryDto } from './dto/discs-list-query.dto';

import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { GetUser } from 'src/identity/auth/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { TopStatsQueryDto } from 'src/catalog/discs/dto/top-stats-query.dto';
import { WeeklyQueryDto } from './dto/weekly-query.dto';
import { RandomQueryDto } from './dto/random-query.dto';
import { OptionsQueryDto } from './dto/options-query.dto';
import { ResolveSpotifyAlbumQueryDto } from './dto/resolve-spotify-album-query.dto';
import { TopDiscOptionsQueryDto } from './dto/top-disc-options-query.dto';

@Controller('discs')
export class DiscsController {
  constructor(private readonly discsServices: DiscsService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createDiscDto: CreateDiscDto) {
    return this.discsServices.create(createDiscDto);
  }

  @Post('with-artist')
  @Auth()
  createWithArtist(@Body() dto: CreateDiscWithArtistDto) {
    return this.discsServices.createWithArtist(dto);
  }

  @Get('weekly')
  findWeekly(@Query() dto: WeeklyQueryDto) {
    return this.discsServices.findWeekly(dto.month, dto.year, dto.week);
  }

  @Get('random')
  @Auth()
  findRandom(@Query() dto: RandomQueryDto, @GetUser() user: User) {
    return this.discsServices.findRandom(dto, user);
  }

  @Get('daily-cover-featured')
  @Auth()
  findDailyCoverFeatured(@GetUser() user: User) {
    return this.discsServices.findDailyCoverFeatured(user);
  }

  @Get('options')
  @Auth()
  findOptions(@Query() dto: OptionsQueryDto) {
    return this.discsServices.findOptions(dto);
  }

  @Get('date')
  @Auth()
  findAllByDate(@Query() query: DiscsCalendarQueryDto, @GetUser() user: User) {
    return this.discsServices.findAllByDate(query, user);
  }

  @Get('date/public')
  findAllByDatePublic(@Query() query: DiscsCalendarQueryDto) {
    return this.discsServices.findAllByDatePublic(query);
  }

  @Get('date/public/filters')
  getPublicFilters() {
    return this.discsServices.getPublicFilters();
  }

  @Auth()
  @Get('topDiscs/options')
  getTopDiscOptions(@Query() dto: TopDiscOptionsQueryDto) {
    return this.discsServices.getTopDiscOptions(dto);
  }

  @Auth()
  @Get('topDiscs')
  getTopDiscs(@Query() dto: TopStatsQueryDto, @GetUser() user: User) {
    return this.discsServices.getTopDiscs(dto, user, dto.genreId);
  }

  /**
   * @deprecated LEGACY: use GET /api/discs/topDiscs. No removal date is planned.
   */
  @Auth()
  @Get('homeDiscs')
  findLegacyTopDiscs(@Query() dto: TopStatsQueryDto, @GetUser() user: User) {
    return this.discsServices.getLegacyTopDiscs(dto, user, dto.genreId);
  }

  @Get()
  @Auth()
  findAll(@Query() query: DiscsListQueryDto, @GetUser() user: User) {
    return this.discsServices.findAll(query, user);
  }

  @Get('spotify/album')
  resolveSpotifyAlbum(@Query() query: ResolveSpotifyAlbumQueryDto) {
    return this.discsServices.resolveSpotifyAlbum(
      query.albumName,
      query.artistName,
    );
  }

  @Get('spotify/album/:spotifyAlbumId')
  getSpotifyAlbumDetails(@Param('spotifyAlbumId') spotifyAlbumId: string) {
    return this.discsServices.getSpotifyAlbumDetails(spotifyAlbumId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.discsServices.findOne(id);
  }

  @Get(':id/spotify-tracks')
  getSpotifyTracks(@Param('id', ParseUUIDPipe) id: string) {
    return this.discsServices.getSpotifyTracks(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDiscDto: UpdateDiscDto,
  ) {
    return this.discsServices.update(id, updateDiscDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.discsServices.remove(id);
  }
}
