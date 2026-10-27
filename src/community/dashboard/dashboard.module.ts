import { Module } from '@nestjs/common';
import { DiscModule } from '../../catalog/discs/discs.module';
import { RatesModule } from '../rates/rates.module';
import { CommunityDashboardController } from './dashboard.controller';
import { CommunityDashboardService } from './dashboard.service';

@Module({
  imports: [RatesModule, DiscModule],
  controllers: [CommunityDashboardController],
  providers: [CommunityDashboardService],
})
export class CommunityDashboardModule {}
