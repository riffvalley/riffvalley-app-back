import { Module } from '@nestjs/common';
import { RequestsModule } from '../../community/requests/requests.module';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { SuggestionsModule } from '../../product/suggestions/suggestions.module';
import { VersionsModule } from '../../product/versions/versions.module';
import { SidebarSummaryController } from './sidebar-summary/sidebar-summary.controller';
import { SidebarSummaryService } from './sidebar-summary/sidebar-summary.service';

@Module({
  imports: [
    AuthorizationModule,
    VersionsModule,
    RequestsModule,
    SuggestionsModule,
  ],
  controllers: [SidebarSummaryController],
  providers: [SidebarSummaryService],
})
export class CrossDomainModule {}
