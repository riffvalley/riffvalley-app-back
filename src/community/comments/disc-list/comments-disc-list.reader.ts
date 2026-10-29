import { Inject, Injectable } from '@nestjs/common';
import { CommunityListQueryDto } from 'src/community/common/dto/community-list-query.dto';
import {
  DiscListReaderCommentRecord,
  DiscListReaderCriteria,
  DiscListReaderPage,
} from 'src/community/common/types/disc-list-reader-criteria';
import { User } from 'src/identity/auth/entities/user.entity';
import {
  DiscListOptionsCriteria,
  DiscListOptionsResult,
} from 'src/community/common/types/disc-list-options';
import { CommentsService } from '../comments.service';

@Injectable()
export class CommentsDiscListReader {
  constructor(
    @Inject(CommentsService)
    private readonly commentsService: Pick<
      CommentsService,
      'findAllByUser' | 'findDiscListOptions'
    >,
  ) {}

  findOptions(
    criteria: DiscListOptionsCriteria,
    user: User,
  ): Promise<DiscListOptionsResult> {
    return this.commentsService.findDiscListOptions(criteria, user);
  }

  findByUser(
    criteria: DiscListReaderCriteria,
    user: User,
  ): Promise<DiscListReaderPage<DiscListReaderCommentRecord>> {
    const query = Object.assign(new CommunityListQueryDto(), {
      limit: criteria.limit,
      offset: criteria.offset,
      query: criteria.query,
      dateRange: criteria.dateRange,
      country: criteria.countryId,
      genre: criteria.genreId,
      type: 'comment',
    });

    return this.commentsService
      .findAllByUser(query, user, {
        stableTieBreak: true,
        includeCountry: true,
        sort: criteria.sort,
        genreIds: criteria.genreIds,
        artistId: criteria.artistId,
      })
      .then((page) => ({
        totalItems: page.totalItems,
        totalPages: page.totalPages,
        currentPage: page.currentPage,
        limit: page.limit,
        data: page.data.map((record) => ({
          id: record.id,
          comment: record.comment,
          createdAt: record.createdAt,
          disc: record.disc,
        })),
      }));
  }
}
