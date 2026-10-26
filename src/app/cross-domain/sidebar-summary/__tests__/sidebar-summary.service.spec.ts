import { Test, TestingModule } from '@nestjs/testing';
import { RequestsService } from '../../../../community/requests/requests.service';
import { User } from '../../../../identity/auth/entities/user.entity';
import { ValidRoles } from '../../../../identity/authorization/interfaces/valid-roles';
import { UsersService } from '../../../../identity/users/users.service';
import { SuggestionsService } from '../../../../product/suggestions/suggestions.service';
import { VersionsService } from '../../../../product/versions/versions.service';
import { SidebarSummaryService } from '../sidebar-summary.service';
import { SidebarSummaryResponse } from '../dto/sidebar-summary-response';

describe('SidebarSummaryService', () => {
  let moduleRef: TestingModule;
  let service: SidebarSummaryService;
  let usersService: jest.Mocked<Pick<UsersService, 'findIdentityById'>>;
  let versionsService: jest.Mocked<
    Pick<VersionsService, 'findLatestProductionVersion'>
  >;
  let requestsService: jest.Mocked<
    Pick<RequestsService, 'countPendingRequests'>
  >;
  let suggestionsService: jest.Mocked<
    Pick<SuggestionsService, 'listInProgressSuggestionIds'>
  >;

  beforeEach(async () => {
    usersService = {
      findIdentityById: jest.fn().mockResolvedValue({
        id: 'user-id',
        role: ValidRoles.user,
        isActive: true,
      }),
    };
    versionsService = {
      findLatestProductionVersion: jest
        .fn<Promise<{ version: string } | null>, []>()
        .mockResolvedValue({ version: '1.8.4' }),
    };
    requestsService = {
      countPendingRequests: jest
        .fn<Promise<number>, []>()
        .mockResolvedValue(12),
    };
    suggestionsService = {
      listInProgressSuggestionIds: jest
        .fn<Promise<string[]>, []>()
        .mockResolvedValue(['uuid-1', 'uuid-2']),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        SidebarSummaryService,
        { provide: UsersService, useValue: usersService },
        { provide: VersionsService, useValue: versionsService },
        { provide: RequestsService, useValue: requestsService },
        { provide: SuggestionsService, useValue: suggestionsService },
      ],
    }).compile();
    service = moduleRef.get(SidebarSummaryService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const userWithRole = (role: ValidRoles): User => {
    usersService.findIdentityById.mockResolvedValue({
      id: 'user-id',
      role,
      isActive: true,
    });
    return Object.assign(new User(), { id: 'user-id' });
  };

  const roleCases: [ValidRoles, SidebarSummaryResponse][] = [
    [ValidRoles.user, { version: { latest: '1.8.4' } }],
    [ValidRoles.collaborator, { version: { latest: '1.8.4' } }],
    [
      ValidRoles.riffvalley,
      { version: { latest: '1.8.4' }, petitions: { pending: 12 } },
    ],
    [
      ValidRoles.superadmin,
      {
        version: { latest: '1.8.4' },
        petitions: { pending: 12 },
        suggestions: { inProgressIds: ['uuid-1', 'uuid-2'] },
      },
    ],
  ];

  it.each(roleCases)(
    'returns the authorized projection for role %s',
    async (role, expected) => {
      const summary = await service.getSummary(userWithRole(role));

      expect(summary).toEqual(expected);
      expect(versionsService.findLatestProductionVersion).toHaveBeenCalledTimes(
        1,
      );
      expect(requestsService.countPendingRequests).toHaveBeenCalledTimes(
        role === ValidRoles.riffvalley || role === ValidRoles.superadmin
          ? 1
          : 0,
      );
      expect(
        suggestionsService.listInProgressSuggestionIds,
      ).toHaveBeenCalledTimes(role === ValidRoles.superadmin ? 1 : 0);
    },
  );

  it('returns a null latest version only when no production version exists', async () => {
    versionsService.findLatestProductionVersion.mockResolvedValue(null);

    await expect(
      service.getSummary(userWithRole(ValidRoles.user)),
    ).resolves.toEqual({ version: { latest: null } });
  });

  it('includes a real zero request count for an authorized role', async () => {
    requestsService.countPendingRequests.mockResolvedValue(0);

    await expect(
      service.getSummary(userWithRole(ValidRoles.riffvalley)),
    ).resolves.toMatchObject({ petitions: { pending: 0 } });
  });

  it('uses the current database role when JwtStrategy user has no selected role', async () => {
    const authenticatedUser = Object.assign(new User(), { id: 'user-id' });
    usersService.findIdentityById.mockResolvedValue({
      id: 'user-id',
      role: ValidRoles.superadmin,
      isActive: true,
    });

    await expect(service.getSummary(authenticatedUser)).resolves.toEqual({
      version: { latest: '1.8.4' },
      petitions: { pending: 12 },
      suggestions: { inProgressIds: ['uuid-1', 'uuid-2'] },
    });
    expect(usersService.findIdentityById).toHaveBeenCalledWith('user-id');
  });

  it('rejects a user that is no longer active', async () => {
    usersService.findIdentityById.mockResolvedValue({
      id: 'user-id',
      role: ValidRoles.superadmin,
      isActive: false,
    });

    await expect(
      service.getSummary(Object.assign(new User(), { id: 'user-id' })),
    ).rejects.toThrow('User is inactive or no longer exists');
    expect(requestsService.countPendingRequests).not.toHaveBeenCalled();
    expect(
      suggestionsService.listInProgressSuggestionIds,
    ).not.toHaveBeenCalled();
  });

  const failureCases: [string, ValidRoles, () => void, string][] = [
    [
      'version',
      ValidRoles.user,
      () =>
        versionsService.findLatestProductionVersion.mockRejectedValue(
          new Error('version read failed'),
        ),
      'version read failed',
    ],
    [
      'requests',
      ValidRoles.riffvalley,
      () =>
        requestsService.countPendingRequests.mockRejectedValue(
          new Error('request count failed'),
        ),
      'request count failed',
    ],
    [
      'suggestions',
      ValidRoles.superadmin,
      () =>
        suggestionsService.listInProgressSuggestionIds.mockRejectedValue(
          new Error('suggestion IDs failed'),
        ),
      'suggestion IDs failed',
    ],
  ];

  it.each(failureCases)(
    'propagates a required %s read failure',
    async (_, role, fail, message) => {
      fail();

      await expect(service.getSummary(userWithRole(role))).rejects.toThrow(
        message,
      );
    },
  );
});
