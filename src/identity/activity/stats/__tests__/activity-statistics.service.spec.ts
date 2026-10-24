import { BadRequestException, NotFoundException } from '@nestjs/common';
import { User } from '../../../auth/entities/user.entity';
import { ActivityStatisticsService } from '../activity-statistics.service';
import {
  ActivityDashboardBaseAggregates,
  ActivityDashboardResponse,
} from '../activity-statistics.types';

describe('ActivityStatisticsService', () => {
  const userRepository = {
    query: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
  };
  let service: ActivityStatisticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ActivityStatisticsService(userRepository as never);
  });

  function dashboardBaseRow(
    overrides: Partial<ActivityDashboardBaseAggregates> = {},
  ): ActivityDashboardBaseAggregates {
    return {
      from: '2026-10-22',
      to: '2026-10-22',
      activityDataSince: '2026-10-01',
      voteDataSince: '2026-10-01',
      activeUsers: 0,
      newVotes: 0,
      votingUsers: 0,
      currentRatings: 0,
      series: [],
      ...overrides,
    };
  }

  function primeSummaryQueries(options?: {
    current?: Partial<ActivityDashboardBaseAggregates>;
    previous?: Partial<ActivityDashboardBaseAggregates>;
    baseline?: Partial<ActivityDashboardBaseAggregates>;
    returning?: {
      currentReturningUsers: number | null;
      previousReturningUsers: number | null;
    };
  }): void {
    userRepository.query
      .mockResolvedValueOnce([dashboardBaseRow(options?.current)])
      .mockResolvedValueOnce([dashboardBaseRow(options?.previous)])
      .mockResolvedValueOnce([dashboardBaseRow(options?.baseline)])
      .mockResolvedValueOnce([
        options?.returning ?? {
          currentReturningUsers: 0,
          previousReturningUsers: 0,
        },
      ]);
  }

  it('preserves nullable dashboard contract values in JSON serialization', () => {
    const dashboard: ActivityDashboardResponse = {
      periods: {
        current: { from: '2026-10-01', to: '2026-10-07' },
        previous: { from: '2026-09-24', to: '2026-09-30' },
        baseline: { from: '2026-09-17', to: '2026-09-23' },
      },
      timezone: 'Europe/Madrid',
      asOf: '2026-10-08T00:00:00.000Z',
      activityDataSince: null,
      voteDataSince: '2026-10-02',
      activeUsers: {
        current: null,
        previous: null,
        delta: null,
        changePercent: null,
        coverage: {
          current: { status: 'unavailable', dataSince: null },
          previous: { status: 'unavailable', dataSince: null },
        },
      },
      newVotes: {
        current: 0,
        previous: null,
        delta: null,
        changePercent: null,
        coverage: {
          current: { status: 'complete', dataSince: '2026-10-02' },
          previous: { status: 'incomplete', dataSince: '2026-10-02' },
        },
      },
      votingUsers: {
        current: null,
        previous: null,
        delta: null,
        changePercent: null,
        coverage: {
          current: { status: 'unavailable', dataSince: null },
          previous: { status: 'unavailable', dataSince: null },
        },
      },
      participationRate: {
        current: null,
        previous: null,
        delta: null,
        changePercent: null,
        coverage: {
          current: { status: 'complete', dataSince: '2026-10-02' },
          previous: { status: 'complete', dataSince: '2026-10-02' },
        },
        reason: 'zero_denominator',
      },
      votesPerActiveUser: {
        current: null,
        previous: null,
        delta: null,
        changePercent: null,
        coverage: {
          current: { status: 'complete', dataSince: '2026-10-02' },
          previous: { status: 'complete', dataSince: '2026-10-02' },
        },
        reason: 'zero_denominator',
      },
      returningUsers: {
        current: null,
        previous: null,
        delta: null,
        changePercent: null,
        coverage: {
          current: { status: 'incomplete', dataSince: null },
          previous: { status: 'incomplete', dataSince: null },
          baseline: { status: 'incomplete', dataSince: null },
        },
      },
      retentionRate: {
        current: null,
        previous: null,
        delta: null,
        changePercent: null,
        coverage: {
          current: { status: 'incomplete', dataSince: null },
          previous: { status: 'incomplete', dataSince: null },
          baseline: { status: 'incomplete', dataSince: null },
        },
      },
      currentRatings: {
        current: 25,
        previous: null,
        delta: null,
        changePercent: null,
        coverage: {
          current: { status: 'complete', dataSince: null },
          previous: { status: 'unavailable', dataSince: null },
        },
        reason: 'unavailable',
      },
      series: {
        current: [
          {
            date: '2026-10-01',
            dayIndex: 1,
            activeUsers: null,
            newVotes: 0,
          },
        ],
        previous: [],
      },
    };

    const serialized = JSON.stringify(dashboard);
    expect(JSON.parse(serialized)).toMatchObject({
      activeUsers: { current: null, previous: null },
      newVotes: { current: 0, previous: null },
      currentRatings: { current: 25, previous: null },
      series: { current: [{ activeUsers: null, newVotes: 0 }] },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns paginated user activity and keeps vote coverage explicit', async () => {
    userRepository.query.mockResolvedValue([
      {
        userId: 'user-1',
        username: 'listener',
        lastActiveDate: '2026-10-21',
        activeDays7: 3,
        activeDays30: 8,
        currentVotes: 4,
        voteActions7: null,
        voteActions30: null,
        voteActionsRecorded: 0,
        lastVoteAt: null,
        votesByDay: [],
        totalItems: 1,
        activityDataSince: '2026-10-22',
        voteDataSince: '2026-10-22',
      },
    ]);

    await expect(
      service.findUsers({ from: '2026-10-01', to: '2026-10-22', limit: 10 }),
    ).resolves.toEqual({
      totalItems: 1,
      limit: 10,
      offset: 0,
      from: '2026-10-01',
      to: '2026-10-22',
      timezone: 'Europe/Madrid',
      activityDataSince: '2026-10-22',
      voteDataSince: '2026-10-22',
      data: [
        {
          userId: 'user-1',
          username: 'listener',
          lastActiveDate: '2026-10-21',
          activeDays7: 3,
          activeDays30: 8,
          currentVotes: 4,
          voteActions7: null,
          voteActions30: null,
          voteActionsRecorded: 0,
          lastVoteAt: null,
          votesByDay: [],
        },
      ],
    });
    expect(userRepository.query.mock.calls[0][0]).toContain(
      "AT TIME ZONE 'Europe/Madrid'",
    );
    expect(userRepository.query.mock.calls[0][0]).toContain(
      'LEFT JOIN event_by_user',
    );
    expect(userRepository.query.mock.calls[0][0]).toContain(
      'COUNT(DISTINCT rate."discId")',
    );
    expect(userRepository.query.mock.calls[0][1]).toEqual([
      '2026-10-01',
      '2026-10-22',
      10,
      0,
    ]);
  });

  it('returns only the definitive dashboard summary contract', async () => {
    userRepository.query.mockResolvedValueOnce([
      dashboardBaseRow({
        activeUsers: 4,
        newVotes: 6,
        votingUsers: 2,
        currentRatings: 17,
        series: [
          {
            date: '2026-10-22',
            dayIndex: 1,
            activeUsers: 4,
            newVotes: 6,
          },
        ],
      }),
    ]);
    userRepository.query.mockResolvedValueOnce([
      dashboardBaseRow({
        from: '2026-10-21',
        to: '2026-10-21',
        activeUsers: 5,
        newVotes: 2,
        votingUsers: 1,
        currentRatings: null,
        series: [
          {
            date: '2026-10-21',
            dayIndex: 1,
            activeUsers: 5,
            newVotes: 2,
          },
        ],
      }),
    ]);
    userRepository.query.mockResolvedValueOnce([
      dashboardBaseRow({
        from: '2026-10-20',
        to: '2026-10-20',
        activeUsers: 2,
        newVotes: 1,
        votingUsers: 1,
        currentRatings: null,
      }),
    ]);
    userRepository.query.mockResolvedValueOnce([
      { currentReturningUsers: 3, previousReturningUsers: 1 },
    ]);

    const response = await service.getSummary({
      from: '2026-10-22',
      to: '2026-10-22',
    });
    expect(response).toEqual({
      dashboard: {
        periods: {
          current: { from: '2026-10-22', to: '2026-10-22' },
          previous: { from: '2026-10-21', to: '2026-10-21' },
          baseline: { from: '2026-10-20', to: '2026-10-20' },
        },
        timezone: 'Europe/Madrid',
        asOf: expect.any(String),
        activityDataSince: '2026-10-01',
        voteDataSince: '2026-10-01',
        activeUsers: {
          current: 4,
          previous: 5,
          delta: -1,
          changePercent: -20,
          coverage: {
            current: { status: 'complete', dataSince: '2026-10-01' },
            previous: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        newVotes: {
          current: 6,
          previous: 2,
          delta: 4,
          changePercent: 200,
          coverage: {
            current: { status: 'complete', dataSince: '2026-10-01' },
            previous: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        votingUsers: {
          current: 2,
          previous: 1,
          delta: 1,
          changePercent: 100,
          coverage: {
            current: { status: 'complete', dataSince: '2026-10-01' },
            previous: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        participationRate: {
          current: 50,
          previous: 20,
          delta: 30,
          changePercent: 150,
          coverage: {
            current: { status: 'complete', dataSince: '2026-10-01' },
            previous: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        votesPerActiveUser: {
          current: 1.5,
          previous: 0.4,
          delta: 1.1,
          changePercent: 275,
          coverage: {
            current: { status: 'complete', dataSince: '2026-10-01' },
            previous: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        returningUsers: {
          current: 3,
          previous: 1,
          delta: 2,
          changePercent: 200,
          coverage: {
            current: { status: 'complete', dataSince: '2026-10-01' },
            previous: { status: 'complete', dataSince: '2026-10-01' },
            baseline: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        retentionRate: {
          current: 60,
          previous: 50,
          delta: 10,
          changePercent: 20,
          coverage: {
            current: { status: 'complete', dataSince: '2026-10-01' },
            previous: { status: 'complete', dataSince: '2026-10-01' },
            baseline: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        currentRatings: {
          current: 17,
          previous: null,
          delta: null,
          changePercent: null,
          coverage: {
            current: { status: 'complete', dataSince: null },
            previous: { status: 'unavailable', dataSince: null },
          },
          reason: 'unavailable',
        },
        series: {
          current: [
            {
              date: '2026-10-22',
              dayIndex: 1,
              activeUsers: 4,
              newVotes: 6,
            },
          ],
          previous: [
            {
              date: '2026-10-21',
              dayIndex: 1,
              activeUsers: 5,
              newVotes: 2,
            },
          ],
        },
      },
    });
    expect(Object.keys(response)).toEqual(['dashboard']);
    expect(userRepository.query).toHaveBeenCalledTimes(4);
    expect(response.dashboard.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(userRepository.query.mock.calls[0][0]).toContain('generate_series');
    expect(userRepository.query.mock.calls[0][0]).toContain(
      'COUNT(DISTINCT vote_event.user_id)',
    );
    expect(userRepository.query.mock.calls[3][0]).toContain(
      'JOIN active_by_period previous_active USING (user_id)',
    );
    expect(userRepository.query.mock.calls[3][0]).toContain(
      'GROUP BY period_ranges.period, activity.user_id',
    );
    expect(userRepository.query.mock.calls[3][1]).toEqual([
      '2026-10-22',
      '2026-10-22',
      '2026-10-21',
      '2026-10-21',
      '2026-10-20',
      '2026-10-20',
      '2026-10-01',
    ]);
    expect(userRepository.query.mock.calls[3][0]).not.toContain(
      'generate_series(',
    );
    expect(userRepository.query.mock.calls[3][0]).not.toContain('FROM rate\n');
  });

  it('builds set-only base aggregates without multiplying activity or vote rows', async () => {
    const series = [
      {
        date: '2026-10-01',
        dayIndex: 1,
        activeUsers: 2,
        newVotes: 2,
      },
      {
        date: '2026-10-02',
        dayIndex: 2,
        activeUsers: 1,
        newVotes: 0,
      },
      {
        date: '2026-10-03',
        dayIndex: 3,
        activeUsers: 0,
        newVotes: 0,
      },
    ];
    userRepository.query.mockResolvedValue([
      {
        from: '2026-10-01',
        to: '2026-10-03',
        activityDataSince: '2026-09-01',
        voteDataSince: '2026-09-01',
        activeUsers: 2,
        newVotes: 2,
        votingUsers: 1,
        currentRatings: 17,
        series,
      },
    ]);

    await expect(
      service.getDashboardBaseAggregates({
        from: '2026-10-01',
        to: '2026-10-03',
      }),
    ).resolves.toEqual({
      from: '2026-10-01',
      to: '2026-10-03',
      activityDataSince: '2026-09-01',
      voteDataSince: '2026-09-01',
      activeUsers: 2,
      newVotes: 2,
      votingUsers: 1,
      currentRatings: 17,
      series,
    });

    const [sql, parameters] = userRepository.query.mock.calls[0];
    expect(parameters).toEqual(['2026-10-01', '2026-10-03']);
    expect(sql).toContain('COUNT(DISTINCT activity.user_id)');
    expect(sql).toContain("WHERE event.event_type = 'set'");
    expect(sql).toContain(
      'COUNT(DISTINCT vote_event.user_id)::int AS voting_users',
    );
    expect(sql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(sql).toContain(
      'activity.activity_date BETWEEN context.from_date AND context.to_date',
    );
    expect(sql).toContain(
      "context.from_date::timestamp AT TIME ZONE 'Europe/Madrid'",
    );
    expect(sql).toContain(
      "(context.to_date + 1)::timestamp AT TIME ZONE 'Europe/Madrid'",
    );
    expect(sql).toContain('generate_series(');
    expect(sql).toContain('COUNT(*) FILTER (WHERE rate.rate IS NOT NULL)');
    expect(sql).toContain('CROSS JOIN activity_period');
    expect(sql).toContain('CROSS JOIN vote_period');
    expect(sql).toContain('GROUPING SETS ((activity.day), ())');
    expect(sql).toContain('GROUPING SETS ((vote_event.day), ())');
    expect(sql.match(/FROM rate_vote_events event/g)).toHaveLength(1);
    expect(sql).not.toContain("event.event_type = 'change'");
    expect(sql).not.toMatch(
      /JOIN\s+(?:user_app_daily_activity|rate_vote_events|rate\b)/i,
    );
  });

  it('returns zero for covered empty days and null for uncovered or partial ranges', async () => {
    userRepository.query.mockResolvedValue([
      {
        from: '2026-10-01',
        to: '2026-10-04',
        activityDataSince: '2026-10-03',
        voteDataSince: '2026-10-04',
        activeUsers: null,
        newVotes: null,
        votingUsers: null,
        currentRatings: 0,
        series: [
          {
            date: '2026-10-01',
            dayIndex: 1,
            activeUsers: null,
            newVotes: null,
          },
          {
            date: '2026-10-02',
            dayIndex: 2,
            activeUsers: null,
            newVotes: null,
          },
          {
            date: '2026-10-03',
            dayIndex: 3,
            activeUsers: 0,
            newVotes: null,
          },
          {
            date: '2026-10-04',
            dayIndex: 4,
            activeUsers: 0,
            newVotes: 0,
          },
        ],
      },
    ]);

    await expect(
      service.getDashboardBaseAggregates({
        from: '2026-10-01',
        to: '2026-10-04',
      }),
    ).resolves.toMatchObject({
      activeUsers: null,
      newVotes: null,
      votingUsers: null,
      currentRatings: 0,
      series: [
        { activeUsers: null, newVotes: null },
        { activeUsers: null, newVotes: null },
        { activeUsers: 0, newVotes: null },
        { activeUsers: 0, newVotes: 0 },
      ],
    });
  });

  it('keeps all daily values unknown when no capture cutoff is available', async () => {
    userRepository.query.mockResolvedValue([
      {
        from: '2026-10-01',
        to: '2026-10-01',
        activityDataSince: null,
        voteDataSince: null,
        activeUsers: null,
        newVotes: null,
        votingUsers: null,
        currentRatings: 0,
        series: [
          {
            date: '2026-10-01',
            dayIndex: 1,
            activeUsers: null,
            newVotes: null,
          },
        ],
      },
    ]);

    await expect(
      service.getDashboardBaseAggregates({
        from: '2026-10-01',
        to: '2026-10-01',
      }),
    ).resolves.toMatchObject({
      activityDataSince: null,
      voteDataSince: null,
      activeUsers: null,
      newVotes: null,
      votingUsers: null,
      series: [{ activeUsers: null, newVotes: null }],
    });
  });

  it.each([
    [7, '2026-10-19', '2026-10-12', '2026-10-18', '2026-10-05', '2026-10-11'],
    [30, '2026-09-26', '2026-08-27', '2026-09-25', '2026-07-28', '2026-08-26'],
    [90, '2026-07-28', '2026-04-29', '2026-07-27', '2026-01-29', '2026-04-28'],
  ] as const)(
    'resolves the inclusive %i-day preset in the Madrid calendar',
    async (
      period,
      expectedFrom,
      previousFrom,
      previousTo,
      baselineFrom,
      baselineTo,
    ) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-24T22:30:00.000Z'));
      primeSummaryQueries();

      await service.getSummary({ period });

      expect(userRepository.query.mock.calls[0][1]).toEqual([
        expectedFrom,
        '2026-10-25',
      ]);
      expect(userRepository.query.mock.calls[1][1]).toEqual([
        previousFrom,
        previousTo,
      ]);
      expect(userRepository.query.mock.calls[2][1]).toEqual([
        baselineFrom,
        baselineTo,
      ]);
    },
  );

  it('builds contiguous custom periods across the Madrid spring DST change', async () => {
    primeSummaryQueries();

    const response = await service.getSummary({
      from: '2026-03-27',
      to: '2026-03-30',
    });

    expect(response.dashboard?.periods).toEqual({
      current: { from: '2026-03-27', to: '2026-03-30' },
      previous: { from: '2026-03-23', to: '2026-03-26' },
      baseline: { from: '2026-03-19', to: '2026-03-22' },
    });
    expect(
      userRepository.query.mock.calls.slice(0, 3).map((call) => call[1]),
    ).toEqual([
      ['2026-03-27', '2026-03-30'],
      ['2026-03-23', '2026-03-26'],
      ['2026-03-19', '2026-03-22'],
    ]);
  });

  it('keeps covered zero denominators null and reports unchanged metrics correctly', async () => {
    primeSummaryQueries({
      current: {
        activeUsers: 0,
        newVotes: 0,
        votingUsers: 0,
      },
      previous: {
        activeUsers: 0,
        newVotes: 0,
        votingUsers: 0,
      },
      baseline: { activeUsers: 0 },
      returning: {
        currentReturningUsers: 0,
        previousReturningUsers: 0,
      },
    });

    const zeroResponse = await service.getSummary({
      from: '2026-10-22',
      to: '2026-10-22',
    });
    expect(zeroResponse.dashboard?.activeUsers).toMatchObject({
      current: 0,
      previous: 0,
      delta: 0,
      changePercent: null,
      reason: 'zero_denominator',
    });
    expect(zeroResponse.dashboard?.participationRate).toMatchObject({
      current: null,
      previous: null,
      delta: null,
      changePercent: null,
      reason: 'zero_denominator',
    });
    expect(zeroResponse.dashboard?.votesPerActiveUser.reason).toBe(
      'zero_denominator',
    );
    expect(zeroResponse.dashboard?.retentionRate.reason).toBe(
      'zero_denominator',
    );

    userRepository.query.mockClear();
    primeSummaryQueries({
      current: { activeUsers: 3, newVotes: 2, votingUsers: 1 },
      previous: { activeUsers: 3, newVotes: 2, votingUsers: 1 },
      baseline: { activeUsers: 3 },
      returning: {
        currentReturningUsers: 1,
        previousReturningUsers: 1,
      },
    });
    const unchangedResponse = await service.getSummary({
      from: '2026-10-22',
      to: '2026-10-22',
    });
    expect(unchangedResponse.dashboard?.activeUsers).toMatchObject({
      current: 3,
      previous: 3,
      delta: 0,
      changePercent: 0,
    });
    expect(unchangedResponse.dashboard?.returningUsers).toMatchObject({
      current: 1,
      previous: 1,
      delta: 0,
      changePercent: 0,
    });
  });

  it('leaves metric values and derived comparisons null across partial coverage', async () => {
    primeSummaryQueries({
      current: {
        activityDataSince: '2026-10-03',
        voteDataSince: '2026-10-04',
        activeUsers: 3,
        newVotes: null,
        votingUsers: null,
        currentRatings: 9,
        series: [
          {
            date: '2026-10-03',
            dayIndex: 1,
            activeUsers: 2,
            newVotes: null,
          },
          {
            date: '2026-10-04',
            dayIndex: 2,
            activeUsers: 1,
            newVotes: 0,
          },
        ],
      },
      previous: {
        activityDataSince: '2026-10-03',
        voteDataSince: '2026-10-04',
        activeUsers: null,
        newVotes: null,
        votingUsers: null,
        series: [],
      },
      baseline: {
        activityDataSince: '2026-10-03',
        voteDataSince: '2026-10-04',
        activeUsers: null,
        newVotes: null,
        votingUsers: null,
      },
      returning: {
        currentReturningUsers: null,
        previousReturningUsers: null,
      },
    });

    const response = await service.getSummary({
      from: '2026-10-03',
      to: '2026-10-04',
    });
    expect(response.dashboard?.activeUsers).toMatchObject({
      current: 3,
      previous: null,
      delta: null,
      changePercent: null,
      coverage: {
        current: { status: 'complete' },
        previous: { status: 'incomplete' },
      },
      reason: 'unavailable',
    });
    expect(response.dashboard?.newVotes).toMatchObject({
      current: null,
      previous: null,
      coverage: {
        current: { status: 'incomplete' },
        previous: { status: 'incomplete' },
      },
      reason: 'unavailable',
    });
    expect(response.dashboard?.retentionRate.current).toBeNull();
    expect(response.dashboard?.series.current).toEqual([
      { date: '2026-10-03', dayIndex: 1, activeUsers: 2, newVotes: null },
      { date: '2026-10-04', dayIndex: 2, activeUsers: 1, newVotes: 0 },
    ]);
  });

  it('keeps the legacy 30-day default and one-sided custom range behavior', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T10:00:00.000Z'));
    primeSummaryQueries();

    await service.getSummary({});
    expect(userRepository.query.mock.calls[0][1]).toEqual([
      '2026-09-23',
      '2026-10-22',
    ]);
    expect(userRepository.query.mock.calls[1][1]).toEqual([
      '2026-08-24',
      '2026-09-22',
    ]);
    expect(userRepository.query.mock.calls[2][1]).toEqual([
      '2026-07-25',
      '2026-08-23',
    ]);

    userRepository.query.mockClear();
    primeSummaryQueries();
    await service.getSummary({ from: '2026-10-01' });
    expect(userRepository.query.mock.calls[0][1]).toEqual([
      '2026-10-01',
      '2026-10-22',
    ]);
  });

  it('rejects custom ranges that run backwards and preset/date combinations', async () => {
    await expect(
      service.getSummary({ from: '2026-10-23', to: '2026-10-22' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getSummary({ period: 7, from: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reversed date ranges and reports missing users', async () => {
    await expect(
      service.getSummary({ from: '2026-10-23', to: '2026-10-22' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    userRepository.findOne.mockResolvedValue(null);
    await expect(
      service.getUserDetail('00000000-0000-4000-8000-000000000001', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queries an existing user detail from daily records and event history', async () => {
    userRepository.findOne.mockResolvedValue(
      Object.assign(new User(), { id: 'user-1' }),
    );
    userRepository.query.mockResolvedValue([
      {
        userId: 'user-1',
        lastActiveDate: '2026-10-22',
        activeDays7: 1,
        activeDays30: 1,
        activeDates: ['2026-10-22'],
        presenceByDay: [
          { date: '2026-10-21', present: null },
          { date: '2026-10-22', present: true },
        ],
        activityDataSince: '2026-10-22',
        activityCoverage: { status: 'incomplete', dataSince: '2026-10-22' },
        currentVotes: 1,
        newVotes7: 1,
        newVotes30: 1,
        newVotesRecorded: 1,
        changedVotes7: 0,
        changedVotes30: 0,
        changedVotesRecorded: 0,
        lastVoteEventAt: '2026-10-22T12:00:00.000Z',
        voteDataSince: '2026-10-22',
        voteCoverage: { status: 'incomplete', dataSince: '2026-10-22' },
        newVotesByDay: [
          { date: '2026-10-21', count: null },
          { date: '2026-10-22', count: 1 },
        ],
        changedVotesByDay: [
          { date: '2026-10-21', count: null },
          { date: '2026-10-22', count: 0 },
        ],
      },
    ]);

    await expect(
      service.getUserDetail('user-1', {
        from: '2026-10-01',
        to: '2026-10-22',
      }),
    ).resolves.toMatchObject({
      userId: 'user-1',
      activeDates: ['2026-10-22'],
      currentVotes: 1,
      newVotesRecorded: 1,
      changedVotesRecorded: 0,
      newVotesByDay: [
        { date: '2026-10-21', count: null },
        { date: '2026-10-22', count: 1 },
      ],
      changedVotesByDay: [
        { date: '2026-10-21', count: null },
        { date: '2026-10-22', count: 0 },
      ],
      activityCoverage: { status: 'incomplete', dataSince: '2026-10-22' },
      voteCoverage: { status: 'incomplete', dataSince: '2026-10-22' },
    });
    const detailSql = userRepository.query.mock.calls[0][0];
    expect(detailSql).toContain("AT TIME ZONE 'Europe/Madrid'");
    expect(detailSql).toContain("event_type = 'set'");
    expect(detailSql).toContain("event_type = 'change'");
    expect(detailSql).toContain('activity_date >= context.activity_data_since');
    expect(detailSql).toContain('generate_series');
    expect(detailSql).toContain('current_votes.count');
    expect(detailSql).not.toMatch(
      /voteActions(?:7|30|Recorded)|lastVoteAt|votesByDay|vote_actions_(?:7|30|recorded)|action_count/,
    );
  });
});
