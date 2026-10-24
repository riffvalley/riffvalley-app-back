import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rate } from '../../community/rates/entities/rate.entity';
import { User } from '../auth/entities/user.entity';
import { UserAccessLog } from '../auth/entities/user-access-log.entity';
import { ActivityService } from './activity.service';
import { UserAppDailyActivity } from './entities/user-app-daily-activity.entity';
import { ActivityController } from './activity.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ActivityStatisticsService } from './stats/activity-statistics.service';
import { RateVoteEvent } from '../../community/rates/entities/rate-vote-event.entity';
import { ActivityInactivityService } from './stats/activity-inactivity.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserAccessLog,
      Rate,
      UserAppDailyActivity,
      RateVoteEvent,
    ]),
    AuthorizationModule,
  ],
  controllers: [ActivityController],
  providers: [
    ActivityService,
    ActivityStatisticsService,
    ActivityInactivityService,
  ],
  exports: [
    ActivityService,
    ActivityStatisticsService,
    ActivityInactivityService,
  ],
})
export class ActivityModule {}
