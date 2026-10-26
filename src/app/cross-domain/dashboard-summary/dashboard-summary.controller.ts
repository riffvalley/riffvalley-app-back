import { Controller, Get } from '@nestjs/common';
import { Auth } from '../../../identity/authorization/decorators/auth.decorator';
import { GetUser } from '../../../identity/authorization/decorators/get-user.decorator';
import { User } from '../../../identity/auth/entities/user.entity';
import { DashboardSummaryResponse } from './dto/dashboard-summary-response';
import { DashboardSummaryService } from './dashboard-summary.service';

@Controller('app')
@Auth()
export class DashboardSummaryController {
  constructor(
    private readonly dashboardSummaryService: DashboardSummaryService,
  ) {}

  @Get('dashboard-summary')
  getSummary(@GetUser() user: User): Promise<DashboardSummaryResponse> {
    return this.dashboardSummaryService.getSummary(user);
  }
}
