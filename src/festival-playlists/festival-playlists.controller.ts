import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { CreateSyncedPlaylistDto } from './dto/create-synced-playlist.dto';
import { SyncPlaylistArtistDto } from './dto/sync-playlist-artist.dto';
import { TopSongsQueryDto } from './dto/top-songs-query.dto';
import { FestivalPlaylistsService } from './festival-playlists.service';

@Controller('festival-playlists')
export class FestivalPlaylistsController {
  constructor(
    private readonly festivalPlaylistsService: FestivalPlaylistsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('spotify/connect')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  connectSpotify() {
    return this.festivalPlaylistsService.startSpotifyConnection();
  }

  @Get('spotify/callback')
  async spotifyCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      if (oauthError)
        throw new HttpException(`Spotify OAuth: ${oauthError}`, 400);
      const result =
        await this.festivalPlaylistsService.completeSpotifyConnection(
          code,
          state,
        );
      const redirectUrl = this.frontendRedirectUrl('connected');
      if (redirectUrl) return response.redirect(redirectUrl);
      return result;
    } catch (error) {
      const redirectUrl = this.frontendRedirectUrl('error');
      if (redirectUrl) return response.redirect(redirectUrl);
      throw error;
    }
  }

  @Get('spotify/connection')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  getSpotifyConnection() {
    return this.festivalPlaylistsService.getSpotifyConnection();
  }

  @Delete('spotify/connection')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  disconnectSpotify() {
    return this.festivalPlaylistsService.disconnectSpotify();
  }

  @Get('artists/top-songs')
  @Auth()
  getTopSongs(@Query() query: TopSongsQueryDto) {
    return this.festivalPlaylistsService.getTopSongs(
      query.artist,
      query.limit,
      query.recentSetlists,
    );
  }

  @Post()
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  createFestivalPlaylist(@Body() dto: CreateSyncedPlaylistDto) {
    return this.festivalPlaylistsService.createFestivalPlaylist(dto);
  }

  @Get(':spotifyId')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  getFestivalPlaylist(@Param('spotifyId', ParseUUIDPipe) spotifyId: string) {
    return this.festivalPlaylistsService.getFestivalPlaylist(spotifyId);
  }

  @Post(':spotifyId/artists')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  addArtist(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Body() dto: SyncPlaylistArtistDto,
  ) {
    return this.festivalPlaylistsService.addArtist(spotifyId, dto);
  }

  @Delete(':spotifyId/artists/:artistId')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  removeArtist(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
  ) {
    return this.festivalPlaylistsService.removeArtist(spotifyId, artistId);
  }

  private frontendRedirectUrl(status: 'connected' | 'error'): string | null {
    const configured = this.configService.get<string>(
      'SPOTIFY_FRONTEND_REDIRECT_URL',
    );
    if (!configured) return null;
    const url = new URL(configured);
    url.searchParams.set('spotify', status);
    return url.toString();
  }
}
