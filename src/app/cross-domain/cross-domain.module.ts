import { Module } from '@nestjs/common';
import { RequestsModule } from '../../community/requests/requests.module';
import { RatesModule } from '../../community/rates/rates.module';
import { DiscModule } from '../../catalog/discs/discs.module';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { SuggestionsModule } from '../../product/suggestions/suggestions.module';
import { VersionsModule } from '../../product/versions/versions.module';
import { SidebarSummaryController } from './sidebar-summary/sidebar-summary.controller';
import { SidebarSummaryService } from './sidebar-summary/sidebar-summary.service';
import { DashboardSummaryController } from './dashboard-summary/dashboard-summary.controller';
import { DashboardSummaryService } from './dashboard-summary/dashboard-summary.service';

@Module({
  imports: [
    AuthorizationModule,
    RatesModule,
    DiscModule,
    VersionsModule,
    RequestsModule,
    SuggestionsModule,
  ],
  controllers: [SidebarSummaryController, DashboardSummaryController],
  providers: [SidebarSummaryService, DashboardSummaryService],
})
export class CrossDomainModule {}
