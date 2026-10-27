import { Module } from '@nestjs/common';
import { DiscModule } from '../../catalog/discs/discs.module';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { RatesModule } from '../rates/rates.module';
import { CommunityDashboardController } from './dashboard.controller';
import { CommunityDashboardService } from './dashboard.service';

@Module({
  imports: [AuthorizationModule, RatesModule, DiscModule],
  controllers: [CommunityDashboardController],
  providers: [CommunityDashboardService],
})
export class CommunityDashboardModule {}
