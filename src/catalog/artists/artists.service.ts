import { Injectable } from '@nestjs/common';
import { CreateArtistDto } from './dto/create-artist.dto';
import { UpdateArtistDto } from './dto/update-artist.dto';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { ArtistCatalogService } from './catalog/artist-catalog.service';
import { ArtistDetailsService } from './details/artist-details.service';
import { ArtistManagementService } from './management/artist-management.service';
import { ArtistOrphansService } from './orphans/artist-orphans.service';
import { ArtistSearchService } from './search/artist-search.service';
import { ArtistWriteService } from './write/artist-write.service';

@Injectable()
export class ArtistsService {
  constructor(
    private readonly artistCatalogService: ArtistCatalogService,
    private readonly artistWriteService: ArtistWriteService,
    private readonly artistSearchService: ArtistSearchService,
    private readonly artistDetailsService: ArtistDetailsService,
    private readonly artistManagementService: ArtistManagementService,
    private readonly artistOrphansService: ArtistOrphansService,
  ) {}

  create(dto: CreateArtistDto) {
    return this.artistWriteService.create(dto);
  }

  findAll(paginationDto: PaginationDto) {
    return this.artistCatalogService.findAll(paginationDto);
  }

  findAllForManagement(
    query?: string,
    limit = 15,
    offset = 0,
    genreId?: string,
    needsReview?: boolean,
  ) {
    return this.artistManagementService.findAllForManagement(
      query,
      limit,
      offset,
      genreId,
      needsReview,
    );
  }

  findOne(id: string) {
    return this.artistCatalogService.findOne(id);
  }

  findOneWithDetails(id: string) {
    return this.artistDetailsService.findOneWithDetails(id);
  }

  findByName(name: string) {
    return this.artistSearchService.findByName(name);
  }

  update(id: string, updateArtistDto: UpdateArtistDto) {
    return this.artistWriteService.update(id, updateArtistDto);
  }

  removeOrphanArtists() {
    return this.artistOrphansService.removeOrphanArtists();
  }

  remove(id: string) {
    return this.artistWriteService.remove(id);
  }
}
