import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CommentsDiscListReader } from 'src/community/comments/disc-list/comments-disc-list.reader';
import { DiscListReaderCriteria } from 'src/community/common/types/disc-list-reader-criteria';
import { FavoritesDiscListReader } from 'src/community/favorites/disc-list/favorites-disc-list.reader';
import { PendingsDiscListReader } from 'src/community/pendings/disc-list/pendings-disc-list.reader';
import { RatesDiscListReader } from 'src/community/rates/disc-list/rates-disc-list.reader';
import { User } from 'src/identity/auth/entities/user.entity';
import { DiscCatalogService } from '../catalog/disc-catalog.service';
import { DiscListMode, DiscListQueryDto } from './dto/disc-list-contracts.dto';
import {
  mapDiscListComment,
  mapDiscListDisc,
  mapDiscListFavorite,
  mapDiscListPending,
  mapDiscListRate,
} from './helpers/map-disc-list-items';
import { DiscListResponse } from './disc-list.types';

@Injectable()
export class DiscListService {
  constructor(
    @Inject(DiscCatalogService)
    private readonly discCatalogService: Pick<
      DiscCatalogService,
      'findDiscList'
    >,
    @Inject(RatesDiscListReader)
    private readonly ratesReader: Pick<RatesDiscListReader, 'findByUser'>,
    @Inject(CommentsDiscListReader)
    private readonly commentsReader: Pick<CommentsDiscListReader, 'findByUser'>,
    @Inject(FavoritesDiscListReader)
    private readonly favoritesReader: Pick<
      FavoritesDiscListReader,
      'findByUser'
    >,
    @Inject(PendingsDiscListReader)
    private readonly pendingsReader: Pick<PendingsDiscListReader, 'findByUser'>,
  ) {}

  async findAll(
    query: DiscListQueryDto,
    user: User,
  ): Promise<DiscListResponse> {
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
      sort: query.sort,
    };
  }
}
