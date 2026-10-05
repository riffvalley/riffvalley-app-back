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

  @Post(':riffValleyPlaylistId/link')
  linkExisting(@Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string) {
    return this.festivalPlaylistsService.linkExistingGenrePlaylist(riffValleyPlaylistId);
  }

  @Get(':riffValleyPlaylistId')
  getPlaylist(@Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string) {
    return this.festivalPlaylistsService.getGenrePlaylist(riffValleyPlaylistId);
  }

  @Patch(':riffValleyPlaylistId')
  updatePlaylist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Body() dto: UpdateSyncedPlaylistDto,
  ) {
    return this.festivalPlaylistsService.updateGenrePlaylist(riffValleyPlaylistId, dto);
  }

  @Put(':riffValleyPlaylistId/image')
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
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @UploadedFile() image: Express.Multer.File,
  ) {
    if (!image) throw new BadRequestException('Falta la imagen de portada');
    return this.festivalPlaylistsService.updateGenrePlaylistImage(
      riffValleyPlaylistId,
      image.buffer,
    );
  }

  @Get(':riffValleyPlaylistId/artists/:artistId/tracks')
  searchTracks(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Query() query: SearchSpotifyTracksQueryDto,
  ) {
    return this.festivalPlaylistsService.searchGenreArtistTracks(
      riffValleyPlaylistId,
      artistId,
      query.q,
    );
  }

  @Post(':riffValleyPlaylistId/artists')
  addArtist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Body() dto: SelectPlaylistArtistTracksDto,
  ) {
    return this.festivalPlaylistsService.addGenreArtist(
      riffValleyPlaylistId,
      dto.artistId,
      dto.spotifyTrackIds,
    );
  }

  @Put(':riffValleyPlaylistId/artists/:artistId/tracks')
  replaceTracks(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Body() dto: ReplacePlaylistArtistTracksDto,
  ) {
    return this.festivalPlaylistsService.replaceGenreArtistTracks(
      riffValleyPlaylistId,
      artistId,
      dto.spotifyTrackIds,
    );
  }

  @Delete(':riffValleyPlaylistId/artists/:artistId')
  removeArtist(
    @Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string,
    @Param('artistId', ParseUUIDPipe) artistId: string,
  ) {
    return this.festivalPlaylistsService.removeGenreArtist(riffValleyPlaylistId, artistId);
  }

  @Delete(':riffValleyPlaylistId/tracks')
  clear(@Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string) {
    return this.festivalPlaylistsService.clearGenrePlaylist(riffValleyPlaylistId);
  }

  @Post(':riffValleyPlaylistId/shuffle')
  shuffle(@Param('riffValleyPlaylistId', ParseUUIDPipe) riffValleyPlaylistId: string) {
    return this.festivalPlaylistsService.shuffleGenrePlaylist(riffValleyPlaylistId);
  }
}
