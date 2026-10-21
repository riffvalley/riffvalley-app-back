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
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { CreateSyncedPlaylistDto } from './dto/create-synced-playlist.dto';
import { LinkSpotifyPlaylistDto } from './dto/link-spotify-playlist.dto';
import { SearchSpotifyTracksQueryDto } from './dto/search-spotify-tracks-query.dto';
import { ReplaceFailedFestivalArtistTracksDto } from './dto/select-playlist-artist-tracks.dto';
import { SyncPlaylistArtistDto } from './dto/sync-playlist-artist.dto';
import { TopSongsQueryDto } from './dto/top-songs-query.dto';
import { UpdateSyncedPlaylistDto } from './dto/update-synced-playlist.dto';
import { SpotifyPlaylistsService } from './spotify-playlists.service';

@Controller('festival-playlists')
export class FestivalPlaylistsController {
  constructor(
    private readonly spotifyPlaylistsService: SpotifyPlaylistsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('spotify/connect')
  @Auth(ValidRoles.riffvalley)
  connectSpotify() {
    return this.spotifyPlaylistsService.startSpotifyConnection();
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
        await this.spotifyPlaylistsService.completeSpotifyConnection(
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
  @Auth(ValidRoles.riffvalley)
  getSpotifyConnection() {
    return this.spotifyPlaylistsService.getSpotifyConnection();
  }

  @Delete('spotify/connection')
  @Auth(ValidRoles.riffvalley)
  disconnectSpotify() {
    return this.spotifyPlaylistsService.disconnectSpotify();
  }

  @Get('artists/top-songs')
  @Auth()
  getTopSongs(@Query() query: TopSongsQueryDto) {
    return this.spotifyPlaylistsService.getTopSongs(
      query.artist,
      query.limit,
      query.recentSetlists,
    );
  }

  @Post()
  @Auth(ValidRoles.riffvalley)
  createFestivalPlaylist(@Body() dto: CreateSyncedPlaylistDto) {
    return this.spotifyPlaylistsService.createFestivalPlaylist(dto);
  }

  @Post('link')
  @Auth(ValidRoles.riffvalley)
  createLinkedFestivalPlaylist(@Body() dto: LinkSpotifyPlaylistDto) {
    return this.spotifyPlaylistsService.createLinkedFestivalPlaylist(dto);
  }

  @Post(':riffValleyPlaylistId/link')
  @Auth(ValidRoles.riffvalley)
  linkExistingFestivalPlaylist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
  ) {
    return this.spotifyPlaylistsService.linkExistingFestivalPlaylist(
      riffValleyPlaylistId,
    );
  }

  @Patch(':riffValleyPlaylistId')
  @Auth(ValidRoles.riffvalley)
  updateFestivalPlaylist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Body() dto: UpdateSyncedPlaylistDto,
  ) {
    return this.spotifyPlaylistsService.updateFestivalPlaylist(
      riffValleyPlaylistId,
      dto,
    );
  }

  @Put(':riffValleyPlaylistId/image')
  @Auth(ValidRoles.riffvalley)
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
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @UploadedFile() image: Express.Multer.File,
  ) {
    if (!image) throw new BadRequestException('Falta la imagen de portada');
    return this.spotifyPlaylistsService.updateFestivalPlaylistImage(
      riffValleyPlaylistId,
      image.buffer,
    );
  }

  @Get(':riffValleyPlaylistId')
  @Auth(ValidRoles.riffvalley)
  getFestivalPlaylist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
  ) {
    return this.spotifyPlaylistsService.getFestivalPlaylist(
      riffValleyPlaylistId,
    );
  }

  @Post(':riffValleyPlaylistId/artists')
  @Auth(ValidRoles.riffvalley)
  addArtist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Body() dto: SyncPlaylistArtistDto,
  ) {
    return this.spotifyPlaylistsService.addArtist(riffValleyPlaylistId, dto);
  }

  @Get(':riffValleyPlaylistId/artists/:artistId/tracks')
  @Auth(ValidRoles.riffvalley)
  searchArtistTracks(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Query() query: SearchSpotifyTracksQueryDto,
  ) {
    return this.spotifyPlaylistsService.searchFestivalArtistTracks(
      riffValleyPlaylistId,
      artistId,
      query.q,
    );
  }

  @Put(':riffValleyPlaylistId/artists/:artistId/tracks')
  @Auth(ValidRoles.riffvalley)
  replaceFailedArtistTracks(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Body() dto: ReplaceFailedFestivalArtistTracksDto,
  ) {
    return this.spotifyPlaylistsService.replaceFailedFestivalArtistTracks(
      riffValleyPlaylistId,
      artistId,
      dto.spotifyTrackIds,
    );
  }

  @Delete(':riffValleyPlaylistId/tracks')
  @Auth(ValidRoles.riffvalley)
  clearFestivalPlaylist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
  ) {
    return this.spotifyPlaylistsService.clearFestivalPlaylist(
      riffValleyPlaylistId,
    );
  }

  @Delete(':riffValleyPlaylistId/artists/:artistId')
  @Auth(ValidRoles.riffvalley)
  removeArtist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
  ) {
    return this.spotifyPlaylistsService.removeArtist(
      riffValleyPlaylistId,
      artistId,
    );
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
