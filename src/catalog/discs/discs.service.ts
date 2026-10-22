import { Injectable, NotFoundException } from '@nestjs/common';
import { Disc } from './entities/disc.entity';
import { DiscsCalendarQueryDto } from './dto/discs-calendar-query.dto';
import { DiscsListQueryDto } from './dto/discs-list-query.dto';
import { TopStatsQueryDto } from './dto/top-stats-query.dto';
import { RandomQueryDto } from './dto/random-query.dto';
import { OptionsQueryDto } from './dto/options-query.dto';
import { CreateDiscDto } from './dto/create-discs.dto';
import { CreateDiscWithArtistDto } from './dto/create-disc-with-artist.dto';
import { UpdateDiscDto } from './dto/update-discs.dto';
import { User } from 'src/identity/auth/entities/user.entity';
import { SpotifyPublicApiService } from 'src/integrations/spotify-integration/api';
import { DiscCatalogService } from './catalog/disc-catalog.service';
import { DiscCalendarService } from './calendar/disc-calendar.service';
import { DiscEnrichmentService } from './enrichment/disc-enrichment.service';
import type { WeeklyCalendarGroup } from './calendar/helpers/map-weekly-discs-to-groups';
import { DiscWriteService } from './write/disc-write.service';
import { DiscSpotifyService } from './spotify/disc-spotify.service';
import { DiscHomeService, DiscHomeResult } from './home/disc-home.service';

@Injectable()
export class DiscsService {
  constructor(
    private readonly spotifyApiService: SpotifyPublicApiService,
    private readonly discCatalogService: DiscCatalogService,
    private readonly discCalendarService: DiscCalendarService,
    private readonly discEnrichmentService: DiscEnrichmentService,
    private readonly discWriteService: DiscWriteService,
    private readonly discSpotifyService: DiscSpotifyService,
    private readonly discHomeService: DiscHomeService,
  ) {}

  async getSpotifyTracks(id: string) {
    return this.discSpotifyService.getSpotifyTracks(id);
  }

  async resolveSpotifyAlbum(albumName: string, artistName: string) {
    const album = await this.spotifyApiService.resolveAlbum(
      artistName,
      albumName,
    );
    if (!album) throw new NotFoundException('Álbum no encontrado en Spotify');
    return album;
  }

  getSpotifyAlbumDetails(spotifyAlbumId: string) {
    return this.spotifyApiService.getAlbumDetails(spotifyAlbumId);
  }

  async create(createDiscDto: CreateDiscDto) {
    return this.discWriteService.create(createDiscDto);
  }

  async createWithArtist(dto: CreateDiscWithArtistDto): Promise<Disc> {
    return this.discWriteService.createWithArtist(dto);
  }

  findAll(query: DiscsListQueryDto, user: User) {
    return this.discCatalogService.findAll(query, user);
  }

  findRandom(dto: RandomQueryDto, user: User) {
    return this.discCatalogService.findRandom(dto, user);
  }

  findOptions(dto: OptionsQueryDto) {
    return this.discCatalogService.findOptions(dto);
  }

  async findAllByDate(query: DiscsCalendarQueryDto, user: User) {
    return this.discCalendarService.findAllByDate(query, user);
  }

  async findAllByDatePublic(query: DiscsCalendarQueryDto) {
    return this.discCalendarService.findAllByDatePublic(query);
  }

  getPublicFilters() {
    return this.discCalendarService.getPublicFilters();
  }

  async findOne(id: string): Promise<Disc> {
    return this.discCatalogService.findOne(id);
  }

  async update(id: string, updateDiscDto: UpdateDiscDto) {
    return this.discWriteService.update(id, updateDiscDto);
  }

  async remove(id: string) {
    return this.discWriteService.remove(id);
  }

  findTopRatedOrFeaturedAndStats(
    query: TopStatsQueryDto,
    user: User,
    genreId?: string,
  ): Promise<DiscHomeResult> {
    return this.discHomeService.findTopRatedOrFeaturedAndStats(
      query,
      user,
      genreId,
    );
  }

  findWeekly(
    month: number,
    year: number,
    week?: number,
  ): Promise<WeeklyCalendarGroup[]> {
    return this.discCalendarService.findWeekly(month, year, week);
  }

  findWeeklyWithoutImage(
    month: number,
    year: number,
    week?: number,
  ): Promise<{ id: string; artistName: string; name: string }[]> {
    return this.discEnrichmentService.findWeeklyWithoutImage(month, year, week);
  }

  updateImage(id: string, image: string): Promise<void> {
    return this.discEnrichmentService.updateImage(id, image);
  }
}
