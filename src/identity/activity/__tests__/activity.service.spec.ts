import { ActivityService } from '../activity.service';

class QueryBuilderMock {
  select = jest.fn(() => this);
  addSelect = jest.fn(() => this);
  leftJoin = jest.fn(() => this);
  groupBy = jest.fn(() => this);
  orderBy = jest.fn(() => this);
  addOrderBy = jest.fn(() => this);
  limit = jest.fn(() => this);
  offset = jest.fn(() => this);
  having = jest.fn(
    (condition: string, parameters?: Record<string, unknown>) => {
      void condition;
      void parameters;
      return this;
    },
  );
  andWhere = jest.fn(
    (condition: string, parameters?: Record<string, unknown>) => {
      void condition;
      void parameters;
      return this;
    },
  );
  getRawMany = jest.fn<Promise<unknown[]>, []>();
  getCount = jest.fn<Promise<number>, []>();
}

describe('ActivityService', () => {
  const userQuery = new QueryBuilderMock();
  const usersPerDayQuery = new QueryBuilderMock();
  const loginQuery = new QueryBuilderMock();
  const userRepository = {
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(userQuery)
      .mockReturnValueOnce(usersPerDayQuery),
    count: jest.fn(),
    query: jest.fn(),
  };
  const userAccessLogRepository = {
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => loginQuery),
  };
  const rateRepository = { findAndCount: jest.fn(), find: jest.fn() };
  let service: ActivityService;

  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.createQueryBuilder
      .mockReturnValueOnce(userQuery)
      .mockReturnValueOnce(usersPerDayQuery);
    userQuery.getRawMany.mockResolvedValue([{ id: 'user-1' }]);
    usersPerDayQuery.getRawMany.mockResolvedValue([
      { date: '2025-01-01', count: 1 },
    ]);
    loginQuery.getRawMany.mockResolvedValue([{ date: '2025-01-02', count: 1 }]);
    userRepository.count.mockResolvedValue(1);
    userRepository.query.mockResolvedValue([]);
    userAccessLogRepository.query.mockResolvedValue(undefined);
    service = new ActivityService(
      userRepository as never,
      userAccessLogRepository as never,
      rateRepository as never,
    );
  });

  it('preserves the composite administrative statistics contract', async () => {
    await expect(
      service.findAllAdminStats({ limit: 5, offset: 0 }),
    ).resolves.toEqual({
      users: {
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
        limit: 5,
        data: [{ id: 'user-1' }],
      },
      usersPerDay: [{ date: '2025-01-01', count: 1 }],
      lastLoginPerDay: [{ date: '2025-01-02', count: 1 }],
      neverAccessed: 1,
      lastVotePerDay: [],
      inactiveVotersPerDay: [],
    });
    expect(userQuery.orderBy).toHaveBeenCalledWith(
      '"user"."lastLogin"',
      'DESC',
      'NULLS LAST',
    );
    expect(userQuery.addOrderBy).toHaveBeenCalledWith(
      '"lastVoteDate"',
      'DESC',
      'NULLS LAST',
    );
    expect(userQuery.limit).toHaveBeenCalledWith(5);
    expect(userQuery.offset).toHaveBeenCalledWith(0);
  });

  it('keeps optional filters and login access aggregation semantics', async () => {
    const before = Date.now();
    await service.findAllAdminStats({
      limit: 2,
      offset: 2,
      notVotedDays: 7,
      accessDays: 15,
      inactiveDays: 30,
    });
    const after = Date.now();

    expect(userQuery.having).toHaveBeenCalledWith(
      expect.stringContaining('IS NULL'),
      expect.objectContaining({ cutoff: expect.any(Date) }),
    );
    expect(loginQuery.andWhere).toHaveBeenCalledWith(
      'log.date >= :since',
      expect.objectContaining({ since: expect.any(Date) }),
    );
    const cutoff = userQuery.having.mock.calls[0][1]?.cutoff;
    const since = loginQuery.andWhere.mock.calls[0][1]?.since;
    expect(cutoff).toBeInstanceOf(Date);
    expect(since).toBeInstanceOf(Date);
    if (!(cutoff instanceof Date) || !(since instanceof Date)) {
      throw new Error('Expected database filters to receive Date values');
    }
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(
      before - 7 * 24 * 60 * 60 * 1000,
    );
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      after - 7 * 24 * 60 * 60 * 1000,
    );
    expect(since.getTime()).toBeGreaterThanOrEqual(
      before - 15 * 24 * 60 * 60 * 1000,
    );
    expect(since.getTime()).toBeLessThanOrEqual(
      after - 15 * 24 * 60 * 60 * 1000,
    );
    expect(userRepository.query).toHaveBeenCalledWith(
      expect.stringContaining('d.day - 30'),
    );
  });

  it('writes the existing idempotent login access record using server date', async () => {
    await service.recordLoginAccess('user-1');
    expect(userAccessLogRepository.query).toHaveBeenCalledWith(
      'INSERT INTO user_access_log ("userId", date) VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING',
      ['user-1'],
    );
  });
});
