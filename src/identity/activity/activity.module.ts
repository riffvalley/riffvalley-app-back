import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rate } from '../../community/rates/entities/rate.entity';
import { User } from '../auth/entities/user.entity';
import { UserAccessLog } from '../auth/entities/user-access-log.entity';
import { ActivityService } from './activity.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserAccessLog, Rate])],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
