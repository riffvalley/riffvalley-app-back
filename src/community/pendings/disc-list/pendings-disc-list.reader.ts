import { Inject, Injectable } from '@nestjs/common';
import { CommunityListQueryDto } from 'src/community/common/dto/community-list-query.dto';
import {
  DiscListReaderCriteria,
  DiscListReaderPage,
  DiscListReaderPendingRecord,
} from 'src/community/common/types/disc-list-reader-criteria';
import { User } from 'src/identity/auth/entities/user.entity';
import { PendingsService } from '../pendings.service';
import {
  DiscListOptionsCriteria,
  DiscListOptionsResult,
} from 'src/community/common/types/disc-list-options';

@Injectable()
export class PendingsDiscListReader {
  constructor(
    @Inject(PendingsService)
    private readonly pendingsService: Pick<
      PendingsService,
      'findAllByUser' | 'findDiscListOptions'
    >,
  ) {}

  findOptions(
    criteria: DiscListOptionsCriteria,
    user: User,
  ): Promise<DiscListOptionsResult> {
    return this.pendingsService.findDiscListOptions(criteria, user);
  }

  findByUser(
    criteria: DiscListReaderCriteria,
    user: User,
  ): Promise<DiscListReaderPage<DiscListReaderPendingRecord>> {
    const query = Object.assign(new CommunityListQueryDto(), {
      limit: criteria.limit,
      offset: criteria.offset,
      query: criteria.query,
      dateRange: criteria.dateRange,
      country: criteria.countryId,
      genre: criteria.genreId,
    });

    return this.pendingsService
      .findAllByUser(query, user, {
        stableTieBreak: true,
        sort: criteria.sort,
      })
      .then((page) => ({
        totalItems: page.totalItems,
        totalPages: page.totalPages,
        currentPage: page.currentPage,
        limit: page.limit,
        data: page.data.map((record) => ({ id: record.id, disc: record.disc })),
      }));
  }
}
