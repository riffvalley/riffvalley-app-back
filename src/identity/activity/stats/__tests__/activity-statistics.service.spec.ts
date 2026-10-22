import { BadRequestException, NotFoundException } from '@nestjs/common';
import { User } from '../../../auth/entities/user.entity';
import { ActivityStatisticsService } from '../activity-statistics.service';

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

  it('returns the daily aggregate series with nullable pre-capture periods', async () => {
    const summary = {
      activeUsers7: 5,
      activeUsers30: 8,
      voteActions7: null,
      voteActions30: null,
      votingUsers7: null,
      votingUsers30: null,
    };
    const series = [
      {
        date: '2026-10-22',
        activeUsers: 2,
        voteActions: null,
        votingUsers: null,
      },
    ];
    userRepository.query.mockResolvedValue([
      {
        from: '2026-10-22',
        to: '2026-10-22',
        activityDataSince: '2026-10-22',
        voteDataSince: '2026-10-22',
        periods: summary,
        series,
      },
    ]);

    await expect(
      service.getSummary({ from: '2026-10-22', to: '2026-10-22' }),
    ).resolves.toEqual({
      from: '2026-10-22',
      to: '2026-10-22',
      timezone: 'Europe/Madrid',
      activityDataSince: '2026-10-22',
      voteDataSince: '2026-10-22',
      periods: summary,
      series,
    });
    expect(userRepository.query.mock.calls[0][0]).toContain('generate_series');
    expect(userRepository.query.mock.calls[0][0]).toContain(
      'COUNT(DISTINCT event.user_id)',
    );
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
        activityDataSince: '2026-10-22',
        currentVotes: 1,
        voteActions7: 1,
        voteActions30: 1,
        voteActionsRecorded: 1,
        lastVoteAt: '2026-10-22T12:00:00.000Z',
        voteDataSince: '2026-10-22',
        votesByDay: [{ date: '2026-10-22', count: 1 }],
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
      votesByDay: [{ date: '2026-10-22', count: 1 }],
    });
    expect(userRepository.query.mock.calls[0][0]).toContain(
      "AT TIME ZONE 'Europe/Madrid'",
    );
  });
});
