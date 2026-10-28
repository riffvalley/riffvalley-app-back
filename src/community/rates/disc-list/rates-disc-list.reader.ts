import { Inject, Injectable } from '@nestjs/common';
import { CommunityListQueryDto } from 'src/community/common/dto/community-list-query.dto';
import {
  DiscListReaderCriteria,
  DiscListReaderPage,
  DiscListReaderRateRecord,
} from 'src/community/common/types/disc-list-reader-criteria';
import { User } from 'src/identity/auth/entities/user.entity';
import {
  DiscListOptionsCriteria,
  DiscListOptionsResult,
} from 'src/community/common/types/disc-list-options';
import { RatesService } from '../rates.service';

type RatesMode = 'rates' | 'covers';

@Injectable()
export class RatesDiscListReader {
  constructor(
    @Inject(RatesService)
    private readonly ratesService: Pick<
      RatesService,
      'findAllByUser' | 'findDiscListOptions'
    >,
  ) {}

  findOptions(
    mode: RatesMode,
    criteria: DiscListOptionsCriteria,
    user: User,
  ): Promise<DiscListOptionsResult> {
    return this.ratesService.findDiscListOptions(
      criteria,
      user,
      mode === 'rates' ? 'rate' : 'cover',
    );
  }

  findByUser(
    mode: RatesMode,
    criteria: DiscListReaderCriteria,
    user: User,
  ): Promise<DiscListReaderPage<DiscListReaderRateRecord>> {
    const query = Object.assign(new CommunityListQueryDto(), {
      limit: criteria.limit,
      offset: criteria.offset,
      query: criteria.query,
      dateRange: criteria.dateRange,
      country: criteria.countryId,
      genre: criteria.genreId,
      type: mode === 'rates' ? 'rate' : 'cover',
      orderBy: this.getOrderBy(criteria.sort),
    });

    return this.ratesService
      .findAllByUser(query, user, {
        stableTieBreak: true,
        genreIds: criteria.genreIds,
      })
      .then((page) => ({
        totalItems: page.totalItems,
        totalPages: page.totalPages,
        currentPage: page.currentPage,
        limit: page.limit,
        data: page.data.map((record) => ({
          id: record.id,
          rate: record.rate,
          cover: record.cover,
          disc: record.disc,
        })),
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
        return 'rate.createdAt:ASC';
      case 'createdAtDesc':
        return 'rate.createdAt:DESC';
      case 'releaseDateDesc':
      case undefined:
        return undefined;
      default:
        return undefined;
    }
  }
}
