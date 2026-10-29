import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { User } from '../../identity/auth/entities/user.entity';
import { Auth } from '../../identity/auth/decorators/auth.decorator';
import { GetUser } from '../../identity/auth/decorators/get-user.decorator';
import { ActivityHistoryCursorService } from './activity-history-cursor.service';
import { ActivityHistoryQueryDto } from './dto/activity-history-query.dto';
import { ActivityHistoryService } from './activity-history.service';
import { ActivityHistoryFilters } from './types/activity-history.types';

@Controller('activity/history')
export class ActivityHistoryController {
  constructor(
    @Inject(ActivityHistoryService)
    private readonly activityHistoryService: Pick<
      ActivityHistoryService,
      'findUserHistory'
    >,
    private readonly cursorService: ActivityHistoryCursorService,
  ) {}

  @Get()
  @Auth()
  async getHistory(
    @GetUser() user: Pick<User, 'id'>,
    @Query() query: ActivityHistoryQueryDto,
  ) {
    const filters: ActivityHistoryFilters = {
      from: query.from,
      to: query.to,
      timeZone: query.timeZone,
      type: query.type,
      query: query.q,
      limit: query.limit,
    };
    if (query.cursor) {
      filters.continuation = this.cursorService.verify(
        query.cursor,
        user.id,
        filters,
        query.limit,
      );
    }

    try {
      const page = await this.activityHistoryService.findUserHistory(
        user.id,
        filters,
      );
      const nextCursor =
        page.hasMore && page.nextPosition
          ? this.cursorService.create(
              user.id,
              filters,
              query.limit,
              page.nextPosition,
            )
          : null;
      return {
        items: page.items,
        nextCursor,
        hasMore: page.hasMore,
        dailySetCounts: page.dailySetCounts,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('requested local date does not exist') ||
          error.message.includes('valid IANA time zone') ||
          error.message.includes('from date must be on or before'))
      ) {
        throw new BadRequestException('Invalid activity history filters.');
      }
      throw error;
    }
  }
}
