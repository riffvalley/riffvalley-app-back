import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { RateVoteEvent } from '../rates/entities/rate-vote-event.entity';
import { ActivityHistoryController } from './activity-history.controller';
import { ActivityHistoryService } from './activity-history.service';
import { ActivityHistoryCursorService } from './activity-history-cursor.service';

@Module({
  imports: [
    ConfigModule,
    AuthorizationModule,
    TypeOrmModule.forFeature([RateVoteEvent]),
  ],
  controllers: [ActivityHistoryController],
  providers: [ActivityHistoryService, ActivityHistoryCursorService],
  exports: [ActivityHistoryService],
})
export class ActivityHistoryModule {}
