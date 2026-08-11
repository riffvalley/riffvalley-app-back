import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { CreateSyncedPlaylistDto } from './dto/create-synced-playlist.dto';
import { LinkSpotifyPlaylistDto } from './dto/link-spotify-playlist.dto';
import { SearchSpotifyTracksQueryDto } from './dto/search-spotify-tracks-query.dto';
import { ReplaceFailedFestivalArtistTracksDto } from './dto/select-playlist-artist-tracks.dto';
import { SyncPlaylistArtistDto } from './dto/sync-playlist-artist.dto';
import { TopSongsQueryDto } from './dto/top-songs-query.dto';
import { UpdateSyncedPlaylistDto } from './dto/update-synced-playlist.dto';
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

  @Post('link')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  createLinkedFestivalPlaylist(@Body() dto: LinkSpotifyPlaylistDto) {
    return this.festivalPlaylistsService.createLinkedFestivalPlaylist(dto);
  }

  @Post(':spotifyId/link')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  linkExistingFestivalPlaylist(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
  ) {
    return this.festivalPlaylistsService.linkExistingFestivalPlaylist(
      spotifyId,
    );
  }

  @Patch(':spotifyId')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  updateFestivalPlaylist(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Body() dto: UpdateSyncedPlaylistDto,
  ) {
    return this.festivalPlaylistsService.updateFestivalPlaylist(spotifyId, dto);
  }

  @Put(':spotifyId/image')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 256 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (file.mimetype !== 'image/jpeg') {
          return callback(
            new BadRequestException('La portada debe ser una imagen JPEG'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  updateFestivalPlaylistImage(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @UploadedFile() image: Express.Multer.File,
  ) {
    if (!image) throw new BadRequestException('Falta la imagen de portada');
    return this.festivalPlaylistsService.updateFestivalPlaylistImage(
      spotifyId,
      image.buffer,
    );
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

  @Get(':spotifyId/artists/:artistId/tracks')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  searchArtistTracks(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Query() query: SearchSpotifyTracksQueryDto,
  ) {
    return this.festivalPlaylistsService.searchFestivalArtistTracks(
      spotifyId,
      artistId,
      query.q,
    );
  }

  @Put(':spotifyId/artists/:artistId/tracks')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  replaceFailedArtistTracks(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Body() dto: ReplaceFailedFestivalArtistTracksDto,
  ) {
    return this.festivalPlaylistsService.replaceFailedFestivalArtistTracks(
      spotifyId,
      artistId,
      dto.spotifyTrackIds,
    );
  }

  @Delete(':spotifyId/tracks')
  @Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
  clearFestivalPlaylist(@Param('spotifyId', ParseUUIDPipe) spotifyId: string) {
    return this.festivalPlaylistsService.clearFestivalPlaylist(spotifyId);
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
