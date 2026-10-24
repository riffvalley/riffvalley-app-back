import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../authorization/decorators/auth.decorator';
import { GetUser } from '../authorization/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { ValidRoles } from '../authorization/interfaces/valid-roles';
import { ActivityService } from './activity.service';
import { GetAccessClient } from './decorators/get-access-client.decorator';
import { ActivityStatisticsService } from './stats/activity-statistics.service';
import { ActivityInactivityService } from './stats/activity-inactivity.service';
import { ActivityInactivityQueryDto } from './stats/dto/activity-inactivity-query.dto';
import {
  ActivityDateRangeQueryDto,
  ActivitySummaryQueryDto,
  ActivityUsersQueryDto,
} from './stats/dto/activity-date-range-query.dto';

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly activityStatisticsService: ActivityStatisticsService,
    private readonly activityInactivityService: ActivityInactivityService,
  ) {}

  @Get('users')
  @Auth(ValidRoles.superadmin)
  getUsers(@Query() query: ActivityUsersQueryDto) {
    return this.activityStatisticsService.findUsers(query);
  }

  @Get('summary')
  @Auth(ValidRoles.superadmin)
  getSummary(@Query() query: ActivitySummaryQueryDto) {
    return this.activityStatisticsService.getSummary(query);
  }

  @Get('inactivity')
  @Auth(ValidRoles.superadmin)
  getInactivity(@Query() query: ActivityInactivityQueryDto) {
    return this.activityInactivityService.getInactivity(query);
  }

  @Get('users/:userId')
  @Auth(ValidRoles.superadmin)
  getUserDetail(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ActivityDateRangeQueryDto,
  ) {
    return this.activityStatisticsService.getUserDetail(userId, query);
  }

  @Post('app/daily')
  @Auth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordAppDailyActivity(
    @GetUser() user: User,
    @GetAccessClient() clientType: unknown,
  ): Promise<void> {
    if (clientType !== 'app') {
      throw new ForbiddenException('App session is required');
    }

    await this.activityService.recordAppDailyActivity(user.id);
  }
}
