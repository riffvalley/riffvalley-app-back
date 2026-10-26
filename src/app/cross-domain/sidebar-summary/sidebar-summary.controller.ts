import { Controller, Get } from '@nestjs/common';
import { Auth } from '../../../identity/authorization/decorators/auth.decorator';
import { GetUser } from '../../../identity/authorization/decorators/get-user.decorator';
import { User } from '../../../identity/auth/entities/user.entity';
import { SidebarSummaryResponse } from './dto/sidebar-summary-response';
import { SidebarSummaryService } from './sidebar-summary.service';

@Controller('app')
@Auth()
export class SidebarSummaryController {
  constructor(private readonly sidebarSummaryService: SidebarSummaryService) {}

  @Get('sidebar-summary')
  getSummary(@GetUser() user: User): Promise<SidebarSummaryResponse> {
    return this.sidebarSummaryService.getSummary(user);
  }
}
