import {
  BadRequestException,
  ParseUUIDPipe,
  Type,
  ValidationPipe,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { UsersService } from 'src/identity/users/users.service';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { Rate } from '../entities/rate.entity';
import { RatesController } from '../rates.controller';
import { RatesService } from '../rates.service';
import { RatesStatsService } from '../stats/rates-stats.service';
import { RatesHistoryService } from '../history/rates-history.service';
import { RatesDashboardSummaryService } from '../stats/rates-dashboard-summary.service';
import { RatesHistoryQueryDto } from '../dto/rates-history-query.dto';
import { RatesArtistSummaryQueryDto } from '../dto/rates-artist-summary-query.dto';
import { RatesArtistsTopQueryDto } from '../dto/rates-artists-top-query.dto';

async function validateHistoryQuery(
  query: Record<string, unknown>,
): Promise<RatesHistoryQueryDto> {
  const result: unknown = await new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }).transform(query, {
    type: 'query',
    metatype: RatesHistoryQueryDto,
  });

  if (!(result instanceof RatesHistoryQueryDto)) {
    throw new Error('ValidationPipe did not return the history query DTO');
  }
  return result;
}

async function validateArtistSummaryQuery(
  query: Record<string, unknown>,
): Promise<RatesArtistSummaryQueryDto> {
  const result: unknown = await new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }).transform(query, {
    type: 'query',
    metatype: RatesArtistSummaryQueryDto,
  });

  if (!(result instanceof RatesArtistSummaryQueryDto)) {
    throw new Error('ValidationPipe did not return artist summary query DTO');
  }
  return result;
}

async function validateArtistsTopQuery(
  query: Record<string, unknown>,
): Promise<RatesArtistsTopQueryDto> {
  const result: unknown = await new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }).transform(query, {
    type: 'query',
    metatype: RatesArtistsTopQueryDto,
  });

  if (!(result instanceof RatesArtistsTopQueryDto)) {
    throw new Error('ValidationPipe did not return artists top query DTO');
  }
  return result;
}

function createRateRepository(): Repository<Rate> {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'rates-controller-test',
  });
  return new Repository<Rate>(Rate, new EntityManager(dataSource));
}

function createUsersService(): UsersService {
  return Object.assign(Object.create(UsersService.prototype), {
    countUsers: jest.fn().mockResolvedValue(0),
  }) as UsersService;
}

describe('RatesController home insights route', () => {
  it('registers an authenticated personal dashboard summary route', async () => {
    const ratesService = new RatesService(createRateRepository());
    const ratesStatsService = new RatesStatsService(
      createRateRepository(),
      createUsersService(),
    );
    const ratesHistoryService = new RatesHistoryService(createRateRepository());
    const dashboardSummaryService = new RatesDashboardSummaryService(
      createRateRepository(),
    );
    const getSummary = jest
      .spyOn(dashboardSummaryService, 'getSummary')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof dashboardSummaryService.getSummary>>,
      );
    const controller = new RatesController(
      ratesService,
      ratesStatsService,
      ratesHistoryService,
      dashboardSummaryService,
    );
    const handler = RatesController.prototype.getDashboardSummary;
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      handler,
    ) as Type<unknown>[];
    const user = Object.assign(new User(), { id: 'identity-from-session' });

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'dashboard-summary',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(guards).toContain(UserRoleGuard);
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
    await controller.getDashboardSummary(user);
    expect(getSummary).toHaveBeenCalledWith('identity-from-session');
  });

  it('registers authenticated GET /rates/home-insights before the generic GET /rates/:id route', async () => {
    const ratesService = new RatesService(createRateRepository());
    const ratesStatsService = new RatesStatsService(
      createRateRepository(),
      createUsersService(),
    );
    const getHomeInsights = jest
      .spyOn(ratesStatsService, 'getHomeInsights')
      .mockResolvedValue({
        topArtists: [],
        countries: [],
      });
    const ratesHistoryService = new RatesHistoryService(createRateRepository());
    const controller = new RatesController(
      ratesService,
      ratesStatsService,
      ratesHistoryService,
      new RatesDashboardSummaryService(createRateRepository()),
    );
    const handler = RatesController.prototype.getHomeInsights;
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      handler,
    ) as Type<unknown>[];

    expect(Reflect.getMetadata(PATH_METADATA, RatesController)).toBe('rates');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('home-insights');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(guards).toHaveLength(2);
    expect(guards).toContain(UserRoleGuard);
    expect(guards[0]).not.toBe(UserRoleGuard);
    expect(typeof guards[0].prototype.canActivate).toBe('function');
    const userArgumentMetadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      RatesController,
      'getHomeInsights',
    ) as Record<string, unknown>;
    const userArgument = Object.values(userArgumentMetadata)[0];
    expect(userArgument).toMatchObject({ index: 0, data: undefined });

    const user = Object.assign(new User(), { id: 'token-user-id' });
    await controller.getHomeInsights(user);
    expect(getHomeInsights).toHaveBeenCalledWith(user);
    expect(RatesController.prototype.findOne).toBeDefined();
    expect(
      Reflect.getMetadata(PATH_METADATA, RatesController.prototype.findOne),
    ).toBe(':id');
  });

  it('registers both authenticated geography routes with session identity only', async () => {
    const stats = new RatesStatsService(
      createRateRepository(),
      createUsersService(),
    );
    const getTop = jest
      .spyOn(stats, 'getGeographyTop')
      .mockResolvedValue({ countries: [] });
    const getWorld = jest.spyOn(stats, 'getGeographyWorld').mockResolvedValue({
      totalRatedDiscs: 0,
      mappedDiscs: 0,
      unmappedDiscs: 0,
      countryCount: 0,
      countries: [],
    });
    const controller = new RatesController(
      new RatesService(createRateRepository()),
      stats,
      new RatesHistoryService(createRateRepository()),
      new RatesDashboardSummaryService(createRateRepository()),
    );
    const user = Object.assign(new User(), { id: 'identity-from-session' });

    for (const [method, path] of [
      ['getGeographyTop', 'geography/top'],
      ['getGeographyWorld', 'geography/world'],
    ] as const) {
      const handler = RatesController.prototype[method];
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        handler,
      ) as Type<unknown>[];
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        RatesController,
        method,
      ) as Record<string, unknown>;
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(guards).toContain(UserRoleGuard);
      expect(Object.values(args)).toContainEqual(
        expect.objectContaining({ index: 0, data: undefined }),
      );
    }

    await controller.getGeographyTop(user);
    await controller.getGeographyWorld(user);
    expect(getTop).toHaveBeenCalledWith(user);
    expect(getWorld).toHaveBeenCalledWith(user);
  });

  it('registers authenticated GET /rates/artists/top using only the session user ID', async () => {
    const stats = new RatesStatsService(
      createRateRepository(),
      createUsersService(),
    );
    const getTopArtists = jest
      .spyOn(stats, 'getTopArtists')
      .mockResolvedValue({ artists: [] });
    const controller = new RatesController(
      new RatesService(createRateRepository()),
      stats,
      new RatesHistoryService(createRateRepository()),
      new RatesDashboardSummaryService(createRateRepository()),
    );
    const handler = RatesController.prototype.getTopArtists;
    const user = Object.assign(new User(), { id: 'session-user-id' });
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      handler,
    ) as Type<unknown>[];
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      RatesController,
      'getTopArtists',
    ) as Record<string, unknown>;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('artists/top');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(guards).toContain(UserRoleGuard);
    expect(Object.values(args)).toContainEqual(
      expect.objectContaining({ index: 0, data: undefined }),
    );
    await controller.getTopArtists(user);
    await controller.getTopArtists(user, { period: 'month' });
    expect(getTopArtists).toHaveBeenCalledWith('session-user-id', 'all');
    expect(getTopArtists).toHaveBeenLastCalledWith('session-user-id', 'month');
  });

  it('validates only supported artist ranking periods and defaults to all', async () => {
    await expect(validateArtistsTopQuery({})).resolves.toMatchObject({
      period: 'all',
    });
    for (const period of ['month', 'year', 'all']) {
      await expect(validateArtistsTopQuery({ period })).resolves.toMatchObject({
        period,
      });
    }
    await expect(
      validateArtistsTopQuery({ period: 'week' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      validateArtistsTopQuery({ period: 'all', userId: 'another-user' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('registers authenticated artist summary with validated UUID and session identity', async () => {
    const stats = new RatesStatsService(
      createRateRepository(),
      createUsersService(),
    );
    const getArtistSummary = jest
      .spyOn(stats, 'getArtistSummary')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof stats.getArtistSummary>>,
      );
    const controller = new RatesController(
      new RatesService(createRateRepository()),
      stats,
      new RatesHistoryService(createRateRepository()),
      new RatesDashboardSummaryService(createRateRepository()),
    );
    const handler = RatesController.prototype.getArtistSummary;
    const user = Object.assign(new User(), { id: 'session-user-id' });
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      handler,
    ) as Type<unknown>[];
    const validArtistId = '20bfa46f-e695-4b93-8736-0faac555f3df';
    const query = await validateArtistSummaryQuery({ page: '2', limit: '5' });

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'artists/:artistId/summary',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(guards).toContain(UserRoleGuard);
    await controller.getArtistSummary(validArtistId, query, user);
    expect(getArtistSummary).toHaveBeenCalledWith(
      'session-user-id',
      validArtistId,
      query,
    );

    await expect(
      new ParseUUIDPipe().transform('not-a-uuid', {
        type: 'param',
        data: 'artistId',
        metatype: String,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateArtistSummaryQuery({ limit: '101' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves the methods, paths and current authentication decorators on the remaining routes', () => {
    const routes = [
      ['getUserStats', RequestMethod.GET, 'stats', true],
      ['getUserHistoryQB', RequestMethod.GET, 'user/:userId/history', false],
      ['findRatesByDisc', RequestMethod.GET, 'disc/:discId', false],
      ['create', RequestMethod.POST, '/', true],
      ['findAll', RequestMethod.GET, '/', true],
      ['findOne', RequestMethod.GET, ':id', true],
      ['update', RequestMethod.PATCH, ':id', true],
      ['remove', RequestMethod.DELETE, ':id', true],
    ] as const;

    for (const [name, method, path, authenticated] of routes) {
      const handler = RatesController.prototype[name];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Boolean(guards)).toBe(authenticated);
      if (authenticated) {
        expect(guards).toHaveLength(2);
        expect(typeof guards[0].prototype.canActivate).toBe('function');
        expect(guards).toContain(UserRoleGuard);
        expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
      }
    }
  });
});

describe('RatesController history route', () => {
  it('uses the existing defaults when query parameters are omitted', async () => {
    const ratesService = new RatesService(createRateRepository());
    const ratesStatsService = new RatesStatsService(
      createRateRepository(),
      createUsersService(),
    );
    const ratesHistoryService = new RatesHistoryService(createRateRepository());
    const findHistory = jest
      .spyOn(ratesHistoryService, 'findUserActionHistoryPaginatedQB')
      .mockResolvedValue({
        userId: 'user-1',
        type: 'both',
        order: 'DESC',
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        limit: 20,
        data: [],
      });
    const controller = new RatesController(
      ratesService,
      ratesStatsService,
      ratesHistoryService,
      new RatesDashboardSummaryService(createRateRepository()),
    );

    const query = await validateHistoryQuery({});
    await controller.getUserHistoryQB('user-1', query);

    expect(findHistory).toHaveBeenCalledWith('user-1', {
      type: 'both',
      order: 'DESC',
      limit: 20,
      offset: 0,
      dateRange: undefined,
    });

    const from = '2025-01-01';
    const to = '2025-01-31';
    const validQuery = await validateHistoryQuery({
      type: 'cover',
      order: 'ASC',
      limit: '10',
      offset: '4',
      from,
      to,
    });
    await controller.getUserHistoryQB('user-2', validQuery);
    expect(findHistory).toHaveBeenLastCalledWith('user-2', {
      type: 'cover',
      order: 'ASC',
      limit: 10,
      offset: 4,
      dateRange: [new Date(from), new Date(to)],
    });
  });

  it('accepts every supported type and order without changing the public route', async () => {
    const ratesService = new RatesService(createRateRepository());
    const ratesStatsService = new RatesStatsService(
      createRateRepository(),
      createUsersService(),
    );
    const ratesHistoryService = new RatesHistoryService(createRateRepository());
    const findHistory = jest
      .spyOn(ratesHistoryService, 'findUserActionHistoryPaginatedQB')
      .mockResolvedValue({
        userId: 'user-1',
        type: 'both',
        order: 'DESC',
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        limit: 20,
        data: [],
      });
    const controller = new RatesController(
      ratesService,
      ratesStatsService,
      ratesHistoryService,
      new RatesDashboardSummaryService(createRateRepository()),
    );

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      RatesController.prototype.getUserHistoryQB,
    );
    expect(guards).toBeUndefined();

    for (const type of ['rate', 'cover', 'both'] as const) {
      for (const order of ['ASC', 'DESC'] as const) {
        const query = await validateHistoryQuery({ type, order });
        await controller.getUserHistoryQB('public-user-id', query);
        expect(findHistory).toHaveBeenLastCalledWith(
          'public-user-id',
          expect.objectContaining({ type, order }),
        );
      }
    }
  });

  it.each([
    ['type', 'unexpected'],
    ['order', 'sideways'],
    ['limit', '12items'],
    ['limit', '1.5'],
    ['limit', '-1'],
    ['limit', '0'],
    ['offset', '4items'],
    ['offset', '1.5'],
    ['offset', '-1'],
    ['from', '2025-02-30'],
    ['from', 'not-a-date'],
    ['to', '2025/01/31'],
  ])('rejects invalid %s=%s with HTTP 400 validation', async (key, value) => {
    await expect(validateHistoryQuery({ [key]: value })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects partial date ranges with HTTP 400', async () => {
    const ratesHistoryService = new RatesHistoryService(createRateRepository());
    const controller = new RatesController(
      new RatesService(createRateRepository()),
      new RatesStatsService(createRateRepository(), createUsersService()),
      ratesHistoryService,
      new RatesDashboardSummaryService(createRateRepository()),
    );

    expect(() =>
      controller.getUserHistoryQB(
        'public-user-id',
        Object.assign(new RatesHistoryQueryDto(), { from: '2025-01-01' }),
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      controller.getUserHistoryQB(
        'public-user-id',
        Object.assign(new RatesHistoryQueryDto(), { to: '2025-01-31' }),
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts real ISO dates and keeps an inclusive date range as Dates for the service', async () => {
    const ratesHistoryService = new RatesHistoryService(createRateRepository());
    const findHistory = jest
      .spyOn(ratesHistoryService, 'findUserActionHistoryPaginatedQB')
      .mockResolvedValue({
        userId: 'user-1',
        type: 'both',
        order: 'DESC',
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        limit: 20,
        data: [],
      });
    const controller = new RatesController(
      new RatesService(createRateRepository()),
      new RatesStatsService(createRateRepository(), createUsersService()),
      ratesHistoryService,
      new RatesDashboardSummaryService(createRateRepository()),
    );
    const query = await validateHistoryQuery({
      from: '2025-01-01',
      to: '2025-01-31',
      limit: '100',
      offset: '0',
    });

    await controller.getUserHistoryQB('public-user-id', query);

    expect(findHistory).toHaveBeenCalledWith('public-user-id', {
      type: 'both',
      order: 'DESC',
      limit: 100,
      offset: 0,
      dateRange: [new Date('2025-01-01'), new Date('2025-01-31')],
    });
  });
});

describe('RatesArtistSummaryQueryDto validation', () => {
  it('uses page 1 and limit 10 by default and transforms supplied integers', async () => {
    await expect(validateArtistSummaryQuery({})).resolves.toMatchObject({
      page: 1,
      limit: 10,
    });
    await expect(
      validateArtistSummaryQuery({ page: '3', limit: '25' }),
    ).resolves.toMatchObject({ page: 3, limit: 25 });
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { page: '10001' },
    { limit: '0' },
    { limit: '101' },
    { userId: 'somebody-else' },
  ])('rejects invalid or unsupported query parameters: %j', async (query) => {
    await expect(validateArtistSummaryQuery(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
