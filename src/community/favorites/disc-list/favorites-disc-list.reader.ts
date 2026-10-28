import { Inject, Injectable } from '@nestjs/common';
import { CommunityListQueryDto } from 'src/community/common/dto/community-list-query.dto';
import {
  DiscListReaderCriteria,
  DiscListReaderFavoriteRecord,
  DiscListReaderPage,
} from 'src/community/common/types/disc-list-reader-criteria';
import { User } from 'src/identity/auth/entities/user.entity';
import { FavoritesService } from '../favorites.service';

@Injectable()
export class FavoritesDiscListReader {
  constructor(
    @Inject(FavoritesService)
    private readonly favoritesService: Pick<FavoritesService, 'findAllByUser'>,
  ) {}

  findByUser(
    criteria: DiscListReaderCriteria,
    user: User,
  ): Promise<DiscListReaderPage<DiscListReaderFavoriteRecord>> {
    const query = Object.assign(new CommunityListQueryDto(), {
      limit: criteria.limit,
      offset: criteria.offset,
      query: criteria.query,
      dateRange: criteria.dateRange,
      country: criteria.countryId,
      genre: criteria.genreId,
      orderBy: this.getOrderBy(criteria.sort),
    });

    return this.favoritesService
      .findAllByUser(query, user, {
        stableTieBreak: true,
      })
      .then((page) => ({
        totalItems: page.totalItems,
        totalPages: page.totalPages,
        currentPage: page.currentPage,
        limit: page.limit,
        data: page.data.map((record) => ({ id: record.id, disc: record.disc })),
      }));
  }

  private getOrderBy(sort: DiscListReaderCriteria['sort']): string | undefined {
    switch (sort) {
      case 'releaseDateAsc':
        return 'disc.releaseDate:ASC,artist.name:ASC';
      case 'myRateDesc':
        return 'rate.rate:DESC,disc.releaseDate:DESC';
      case 'myRateAsc':
        return 'rate.rate:ASC,disc.releaseDate:DESC';
      case 'myCoverDesc':
        return 'rate.cover:DESC,artist.name:ASC';
      case 'myCoverAsc':
        return 'rate.cover:ASC,artist.name:ASC';
      case 'averageRateDesc':
        return 'averageRate:DESC,disc.releaseDate:DESC';
      case 'averageRateAsc':
        return 'averageRate:ASC,disc.releaseDate:DESC';
      case 'averageCoverDesc':
        return 'averageCover:DESC,disc.releaseDate:DESC';
      case 'averageCoverAsc':
        return 'averageCover:ASC,disc.releaseDate:DESC';
      case 'createdAtAsc':
        return 'favorite.createdAt:ASC';
      case 'createdAtDesc':
        return 'favorite.createdAt:DESC';
      case 'releaseDateDesc':
      case undefined:
        return undefined;
      default:
        return undefined;
    }
  }
}
