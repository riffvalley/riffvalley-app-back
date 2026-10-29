import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CommentsDiscListReader } from 'src/community/comments/disc-list/comments-disc-list.reader';
import { DiscListReaderCriteria } from 'src/community/common/types/disc-list-reader-criteria';
import { FavoritesDiscListReader } from 'src/community/favorites/disc-list/favorites-disc-list.reader';
import { PendingsDiscListReader } from 'src/community/pendings/disc-list/pendings-disc-list.reader';
import { RatesDiscListReader } from 'src/community/rates/disc-list/rates-disc-list.reader';
import { User } from 'src/identity/auth/entities/user.entity';
import { DiscCatalogService } from '../catalog/disc-catalog.service';
import {
  DiscListMode,
  DiscListOptionsQueryDto,
  DiscListQueryDto,
} from './dto/disc-list-contracts.dto';
import {
  mapDiscListComment,
  mapDiscListDisc,
  mapDiscListFavorite,
  mapDiscListPending,
  mapDiscListRate,
} from './helpers/map-disc-list-items';
import { DiscListOptionsResponse, DiscListResponse } from './disc-list.types';
import { DiscListSuggestionsService } from '../suggestions/disc-list-suggestions.service';
import { DiscListSuggestionsResponse } from '../suggestions/disc-list-suggestions.types';

@Injectable()
export class DiscListService {
  constructor(
    @Inject(DiscCatalogService)
    private readonly discCatalogService: Pick<
      DiscCatalogService,
      'findDiscList' | 'findDiscListOptions' | 'countDiscListGenres'
    >,
    @Inject(RatesDiscListReader)
    private readonly ratesReader: Pick<
      RatesDiscListReader,
      'findByUser' | 'findOptions'
    >,
    @Inject(CommentsDiscListReader)
    private readonly commentsReader: Pick<
      CommentsDiscListReader,
      'findByUser' | 'findOptions'
    >,
    @Inject(FavoritesDiscListReader)
    private readonly favoritesReader: Pick<
      FavoritesDiscListReader,
      'findByUser' | 'findOptions'
    >,
    @Inject(PendingsDiscListReader)
    private readonly pendingsReader: Pick<
      PendingsDiscListReader,
      'findByUser' | 'findOptions'
    >,
    @Inject(DiscListSuggestionsService)
    private readonly suggestionsService: Pick<
      DiscListSuggestionsService,
      'findSuggestions'
    >,
  ) {}

  findSuggestions(query?: string): Promise<DiscListSuggestionsResponse> {
    return this.suggestionsService.findSuggestions(query);
  }

  async findOptions(
    query: DiscListOptionsQueryDto,
    user: User,
  ): Promise<DiscListOptionsResponse> {
    await this.validateGenreCount(query.genreIds);
    const criteria = {
      query: query.query,
      dateRange: query.dateRange,
      countryId: query.countryId,
      genreId: query.genreId,
      genreIds: query.genreIds,
    };

    switch (query.mode) {
      case DiscListMode.ALL:
        return this.discCatalogService.findDiscListOptions(query, user);
      case DiscListMode.RATES:
        return this.ratesReader.findOptions('rates', criteria, user);
      case DiscListMode.COVERS:
        return this.ratesReader.findOptions('covers', criteria, user);
      case DiscListMode.COMMENTS:
        return this.commentsReader.findOptions(criteria, user);
      case DiscListMode.FAVORITES:
        return this.favoritesReader.findOptions(criteria, user);
      case DiscListMode.PENDIENTES:
        return this.pendingsReader.findOptions(criteria, user);
      default:
        throw new BadRequestException('Unsupported DiscList mode');
    }
  }

  async findAll(
    query: DiscListQueryDto,
    user: User,
  ): Promise<DiscListResponse> {
    await this.validateGenreCount(query.genreIds);
    const criteria = this.toReaderCriteria(query);

    switch (query.mode) {
      case DiscListMode.ALL: {
        const page = await this.discCatalogService.findDiscList(query, user);
        return {
          totalItems: page.totalItems,
          totalPages: page.totalPages,
          currentPage: page.currentPage,
          limit: page.limit,
          data: page.data.map(mapDiscListDisc),
        };
      }
      case DiscListMode.RATES: {
        const page = await this.ratesReader.findByUser('rates', criteria, user);
        return {
          totalItems: page.totalItems,
          totalPages: page.totalPages,
          currentPage: page.currentPage,
          limit: page.limit,
          data: page.data.map((record) => mapDiscListRate(record, 'rate')),
        };
      }
      case DiscListMode.COVERS: {
        const page = await this.ratesReader.findByUser(
          'covers',
          criteria,
          user,
        );
        return {
          totalItems: page.totalItems,
          totalPages: page.totalPages,
          currentPage: page.currentPage,
          limit: page.limit,
          data: page.data.map((record) => mapDiscListRate(record, 'cover')),
        };
      }
      case DiscListMode.COMMENTS: {
        const page = await this.commentsReader.findByUser(criteria, user);
        return {
          totalItems: page.totalItems,
          totalPages: page.totalPages,
          currentPage: page.currentPage,
          limit: page.limit,
          data: page.data.map(mapDiscListComment),
        };
      }
      case DiscListMode.FAVORITES: {
        const page = await this.favoritesReader.findByUser(criteria, user);
        return {
          totalItems: page.totalItems,
          totalPages: page.totalPages,
          currentPage: page.currentPage,
          limit: page.limit,
          data: page.data.map(mapDiscListFavorite),
        };
      }
      case DiscListMode.PENDIENTES: {
        const page = await this.pendingsReader.findByUser(criteria, user);
        return {
          totalItems: page.totalItems,
          totalPages: page.totalPages,
          currentPage: page.currentPage,
          limit: page.limit,
          data: page.data.map(mapDiscListPending),
        };
      }
      default:
        throw new BadRequestException('Unsupported DiscList mode');
    }
  }

  private toReaderCriteria(query: DiscListQueryDto): DiscListReaderCriteria {
    return {
      limit: query.limit,
      offset: query.offset,
      query: query.query,
      dateRange: query.dateRange,
      countryId: query.countryId,
      genreId: query.genreId,
      genreIds: query.genreIds,
      sort: query.sort,
    };
  }

  private async validateGenreCount(genreIds?: string[]): Promise<void> {
    if (!genreIds?.length) return;
    const catalogGenreCount =
      await this.discCatalogService.countDiscListGenres();
    if (genreIds.length > catalogGenreCount) {
      throw new BadRequestException(
        `genreIds cannot contain more than ${catalogGenreCount} catalog genres`,
      );
    }
  }
}
