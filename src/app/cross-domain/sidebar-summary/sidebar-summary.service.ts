import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestsService } from '../../../community/requests/requests.service';
import { User } from '../../../identity/auth/entities/user.entity';
import {
  roleMeetsMinimum,
  ValidRoles,
} from '../../../identity/authorization/interfaces/valid-roles';
import { UsersService } from '../../../identity/users/users.service';
import { SuggestionsService } from '../../../product/suggestions/suggestions.service';
import { VersionsService } from '../../../product/versions/versions.service';
import { SidebarSummaryResponse } from './dto/sidebar-summary-response';

@Injectable()
export class SidebarSummaryService {
  constructor(
    private readonly usersService: UsersService,
    private readonly versionsService: VersionsService,
    private readonly requestsService: RequestsService,
    private readonly suggestionsService: SuggestionsService,
  ) {}

  async getSummary(user: User): Promise<SidebarSummaryResponse> {
    const [identity, latestVersion] = await Promise.all([
      this.usersService.findIdentityById(user.id),
      this.versionsService.findLatestProductionVersion(),
    ]);

    if (!identity || !identity.isActive) {
      throw new UnauthorizedException('User is inactive or no longer exists');
    }

    const canReadRequestsByCurrentRole = roleMeetsMinimum(
      identity.role,
      ValidRoles.riffvalley,
    );
    const canReadSuggestions = identity.role === ValidRoles.superadmin;

    const [pendingRequests, inProgressSuggestionIds] = await Promise.all([
      canReadRequestsByCurrentRole
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
