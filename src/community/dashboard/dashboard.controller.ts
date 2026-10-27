import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../../identity/auth/decorators/auth.decorator';
import { CommunityDashboardYearQueryDto } from './dto/community-dashboard-year-query.dto';
import { CommunityDashboardService } from './dashboard.service';

@Controller('community/dashboard')
@Auth()
export class CommunityDashboardController {
  constructor(private readonly dashboardService: CommunityDashboardService) {}

  @Get('rankings')
  getRankings(@Query() query: CommunityDashboardYearQueryDto) {
    return this.dashboardService.getRankings(query.year);
  }

  @Get('stats')
  getStats(@Query() query: CommunityDashboardYearQueryDto) {
    return this.dashboardService.getStats(query.year);
  }
}
