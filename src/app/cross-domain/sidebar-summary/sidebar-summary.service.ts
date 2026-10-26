import { Injectable } from '@nestjs/common';
import { RequestsService } from '../../../community/requests/requests.service';
import { User } from '../../../identity/auth/entities/user.entity';
import {
  roleMeetsMinimum,
  ValidRoles,
} from '../../../identity/authorization/interfaces/valid-roles';
import { SuggestionsService } from '../../../product/suggestions/suggestions.service';
import { VersionsService } from '../../../product/versions/versions.service';
import { SidebarSummaryResponse } from './dto/sidebar-summary-response';

@Injectable()
export class SidebarSummaryService {
  constructor(
    private readonly versionsService: VersionsService,
    private readonly requestsService: RequestsService,
    private readonly suggestionsService: SuggestionsService,
  ) {}

  async getSummary(user: User): Promise<SidebarSummaryResponse> {
    const canReadRequests = roleMeetsMinimum(user.role, ValidRoles.riffvalley);
    const canReadSuggestions = user.role === ValidRoles.superadmin;

    const [latestVersion, pendingRequests, inProgressSuggestionIds] =
      await Promise.all([
        this.versionsService.findLatestProductionVersion(),
        canReadRequests
          ? this.requestsService.countPendingRequests()
          : Promise.resolve(undefined),
        canReadSuggestions
          ? this.suggestionsService.listInProgressSuggestionIds()
          : Promise.resolve(undefined),
      ]);

    const summary: SidebarSummaryResponse = {
      version: { latest: latestVersion?.version ?? null },
    };

    if (pendingRequests !== undefined) {
      summary.petitions = { pending: pendingRequests };
    }
    if (inProgressSuggestionIds !== undefined) {
      summary.suggestions = { inProgressIds: inProgressSuggestionIds };
    }

    return summary;
  }
}
