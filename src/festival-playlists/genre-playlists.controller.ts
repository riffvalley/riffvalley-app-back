import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { CreateSyncedPlaylistDto } from './dto/create-synced-playlist.dto';
import { LinkSpotifyPlaylistDto } from './dto/link-spotify-playlist.dto';
import { SearchSpotifyTracksQueryDto } from './dto/search-spotify-tracks-query.dto';
import {
  ReplacePlaylistArtistTracksDto,
  SelectPlaylistArtistTracksDto,
} from './dto/select-playlist-artist-tracks.dto';
import { UpdateSyncedPlaylistDto } from './dto/update-synced-playlist.dto';
import { FestivalPlaylistsService } from './festival-playlists.service';

@Controller('genre-playlists')
@Auth(ValidRoles.admin, ValidRoles.superUser, ValidRoles.riffValley)
export class GenrePlaylistsController {
  constructor(
    private readonly festivalPlaylistsService: FestivalPlaylistsService,
  ) {}

  @Post()
  create(@Body() dto: CreateSyncedPlaylistDto) {
    return this.festivalPlaylistsService.createGenrePlaylist(dto);
  }

  @Post('link')
  createLinked(@Body() dto: LinkSpotifyPlaylistDto) {
    return this.festivalPlaylistsService.createLinkedGenrePlaylist(dto);
  }

  @Post(':spotifyId/link')
  linkExisting(@Param('spotifyId', ParseUUIDPipe) spotifyId: string) {
    return this.festivalPlaylistsService.linkExistingGenrePlaylist(spotifyId);
  }

  @Get(':spotifyId')
  getPlaylist(@Param('spotifyId', ParseUUIDPipe) spotifyId: string) {
    return this.festivalPlaylistsService.getGenrePlaylist(spotifyId);
  }

  @Patch(':spotifyId')
  updatePlaylist(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Body() dto: UpdateSyncedPlaylistDto,
  ) {
    return this.festivalPlaylistsService.updateGenrePlaylist(spotifyId, dto);
  }

  @Put(':spotifyId/image')
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
  updateImage(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @UploadedFile() image: Express.Multer.File,
  ) {
    if (!image) throw new BadRequestException('Falta la imagen de portada');
    return this.festivalPlaylistsService.updateGenrePlaylistImage(
      spotifyId,
      image.buffer,
    );
  }

  @Get(':spotifyId/artists/:artistId/tracks')
  searchTracks(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Query() query: SearchSpotifyTracksQueryDto,
  ) {
    return this.festivalPlaylistsService.searchGenreArtistTracks(
      spotifyId,
      artistId,
      query.q,
    );
  }

  @Post(':spotifyId/artists')
  addArtist(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Body() dto: SelectPlaylistArtistTracksDto,
  ) {
    return this.festivalPlaylistsService.addGenreArtist(
      spotifyId,
      dto.artistId,
      dto.spotifyTrackIds,
    );
  }

  @Put(':spotifyId/artists/:artistId/tracks')
  replaceTracks(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Body() dto: ReplacePlaylistArtistTracksDto,
  ) {
    return this.festivalPlaylistsService.replaceGenreArtistTracks(
      spotifyId,
      artistId,
      dto.spotifyTrackIds,
    );
  }

  @Delete(':spotifyId/artists/:artistId')
  removeArtist(
    @Param('spotifyId', ParseUUIDPipe) spotifyId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
  ) {
    return this.festivalPlaylistsService.removeGenreArtist(spotifyId, artistId);
  }

  @Delete(':spotifyId/tracks')
  clear(@Param('spotifyId', ParseUUIDPipe) spotifyId: string) {
    return this.festivalPlaylistsService.clearGenrePlaylist(spotifyId);
  }

  @Post(':spotifyId/shuffle')
  shuffle(@Param('spotifyId', ParseUUIDPipe) spotifyId: string) {
    return this.festivalPlaylistsService.shuffleGenrePlaylist(spotifyId);
  }
}
