import { ActivityInactivityService } from '../activity-inactivity.service';
import { ActivityInactivityGroup } from '../activity-inactivity.types';
import { ValidRoles } from '../../../authorization/interfaces/valid-roles';

describe('ActivityInactivityService', () => {
  const repository = { query: jest.fn() };
  let service: ActivityInactivityService;

  const groups: Record<ActivityInactivityGroup, number> = {
    '0_2_days': 1,
    '3_6_days': 1,
    '7_13_days': 1,
    '14_29_days': 1,
    '30_59_days': 1,
    '60_plus_days': 1,
    never_voted: 1,
    insufficient_history: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ActivityInactivityService(repository as never);
    repository.query.mockResolvedValue([
      {
        asOf: '2026-10-24',
        totalUsers: 8,
        groups,
        captureStartedAt: '2026-10-22T10:00:00.000Z',
        captureDataSince: '2026-10-22',
        data: [
          {
            userId: 'u-1',
            username: 'listener',
            role: 'user',
            isActive: false,
            lastVoteAt: null,
            daysSinceLastVote: null,
            inactivityGroup: 'never_voted',
            lastPresenceAt: '2026-10-24',
            lastRatingModifiedAt: null,
            currentRatings: 1,
          },
        ],
      },
    ]);
  });

  it('returns the full mutually exclusive summary with the requested page', async () => {
    const response = await service.getInactivity({
      asOf: '2026-10-24',
      limit: 10,
      offset: 0,
    });

    expect(response).toMatchObject({
      asOf: '2026-10-24',
      timezone: 'Europe/Madrid',
      totalUsers: 8,
      groups,
      limit: 10,
      offset: 0,
      sortBy: 'daysSinceLastVote',
      sortOrder: 'desc',
      data: [
        { userId: 'u-1', inactivityGroup: 'never_voted', currentRatings: 1 },
      ],
      coverage: {
        status: 'partial',
        captureStartedAt: '2026-10-22T10:00:00.000Z',
        captureDataSince: '2026-10-22',
      },
    });
    expect(
      Object.values(response.groups).reduce((sum, count) => sum + count, 0),
    ).toBe(response.totalUsers);
  });

  it('uses SQL calendar-day boundaries for every inactivity bucket', async () => {
    await service.getInactivity({ asOf: '2026-10-24' });
    const sql = repository.query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(sql).toContain("event.event_type = 'set'");
    expect(sql).toContain(
      "event.occurred_at < ((params.as_of + 1)::timestamp AT TIME ZONE 'Europe/Madrid')",
    );
    for (const boundary of [2, 6, 13, 29, 59]) {
      expect(sql).toContain(`<= ${boundary} THEN`);
    }
    expect(sql).not.toContain("event.event_type = 'change'");
  });

  it('keeps coverage, future evidence, and current ratings separate from last set votes', async () => {
    await service.getInactivity({ asOf: '2026-03-29' });
    const sql = repository.query.mock.calls[0]?.[0] as string;
    expect(sql).toContain(
      "BOOL_OR(event.event_type IN ('set', 'change')) AS has_vote_event",
    );
    expect(sql).toContain(
      "WHEN vote_evidence.has_vote_event THEN 'insufficient_history'",
    );
    expect(sql).toContain(
      'app_user."createdAt" >= (capture.started_at AT TIME ZONE current_setting(\'TimeZone\'))',
    );
    expect(sql).toContain(
      "app_user.\"createdAt\" < ((params.as_of + 1)::timestamp AT TIME ZONE 'Europe/Madrid' AT TIME ZONE current_setting('TimeZone'))",
    );
    expect(sql).toContain('MAX(rate."editedAt")');
    expect(sql).toContain(
      'COUNT(*) FILTER (WHERE rate.rate IS NOT NULL)::int AS current_ratings',
    );
    expect(sql).toContain(
      'MAX(activity.activity_date)::text AS last_presence_at',
    );
  });

  it('passes role, account state, pagination, and stable sorting as bound values', async () => {
    await service.getInactivity({
      role: ValidRoles.collaborator,
      isActive: 'false',
      limit: 7,
      offset: 14,
      sortBy: 'username',
      sortOrder: 'desc',
    });

    expect(repository.query.mock.calls[0]?.[1]).toEqual([
      null,
      ValidRoles.collaborator,
      'false',
      7,
      14,
    ]);
    const sql = repository.query.mock.calls[0]?.[0] as string;
    expect(sql).toContain(
      'params.role_filter IS NULL OR app_user.role = params.role_filter',
    );
    expect(sql).toContain(
      'params.active_filter IS NULL OR app_user."isActive" = params.active_filter',
    );
    expect(sql).toContain('ORDER BY classified.username DESC NULLS LAST');
    expect(sql).toContain('classified.user_id ASC');
  });
});
