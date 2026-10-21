import { Type } from '@nestjs/common';
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
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { Rate } from '../entities/rate.entity';
import { RatesController } from '../rates.controller';
import { RatesService } from '../rates.service';
import { RatesStatsService } from '../stats/rates-stats.service';
import { RatesHistoryService } from '../history/rates-history.service';

function createRateRepository(): Repository<Rate> {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'rates-controller-test',
  });
  return new Repository<Rate>(Rate, new EntityManager(dataSource));
}

function createUserRepository(): Repository<User> {
  const dataSource = new DataSource({
    type: 'postgres',
    database: 'rates-controller-test',
  });
  return new Repository<User>(User, new EntityManager(dataSource));
}

describe('RatesController home insights route', () => {
  it('registers authenticated GET /rates/home-insights before the generic GET /rates/:id route', async () => {
    const ratesService = new RatesService(createRateRepository());
    const ratesStatsService = new RatesStatsService(
      createRateRepository(),
      createUserRepository(),
    );
    const getHomeInsights = jest
      .spyOn(ratesStatsService, 'getHomeInsights')
      .mockResolvedValue({ topArtists: [], countries: [] });
    const ratesHistoryService = new RatesHistoryService(createRateRepository());
    const controller = new RatesController(
      ratesService,
      ratesStatsService,
      ratesHistoryService,
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
  it('delegates parsed history options directly and ignores a partial date range', async () => {
    const ratesService = new RatesService(createRateRepository());
    const ratesStatsService = new RatesStatsService(
      createRateRepository(),
      createUserRepository(),
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
    );

    await controller.getUserHistoryQB(
      'user-1',
      undefined,
      undefined,
      undefined,
      undefined,
      '2025-01-01',
    );

    expect(findHistory).toHaveBeenCalledWith('user-1', {
      type: 'both',
      order: 'DESC',
      limit: 20,
      offset: 0,
      dateRange: undefined,
    });

    const from = '2025-01-01';
    const to = '2025-01-31';
    await controller.getUserHistoryQB(
      'user-2',
      'cover',
      'ASC',
      '10',
      '4',
      from,
      to,
    );
    expect(findHistory).toHaveBeenLastCalledWith('user-2', {
      type: 'cover',
      order: 'ASC',
      limit: 10,
      offset: 4,
      dateRange: [new Date(from), new Date(to)],
    });
  });

  it('keeps the public history route defaults and current permissive parsing behavior', async () => {
    const ratesService = new RatesService(createRateRepository());
    const ratesStatsService = new RatesStatsService(
      createRateRepository(),
      createUserRepository(),
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
    );

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      RatesController.prototype.getUserHistoryQB,
    );
    expect(guards).toBeUndefined();

    await controller.getUserHistoryQB('public-user-id');
    expect(findHistory).toHaveBeenLastCalledWith('public-user-id', {
      type: 'both',
      order: 'DESC',
      limit: 20,
      offset: 0,
      dateRange: undefined,
    });

    const invalidFrom = 'not-a-date';
    const invalidTo = 'also-not-a-date';
    await Reflect.apply(controller.getUserHistoryQB, controller, [
      'public-user-id',
      'unexpected-type',
      'sideways',
      '12items',
      '-3',
      invalidFrom,
      invalidTo,
    ]);

    expect(findHistory).toHaveBeenLastCalledWith(
      'public-user-id',
      expect.objectContaining({
        type: 'unexpected-type',
        order: 'sideways',
        limit: 12,
        offset: -3,
        dateRange: expect.any(Array),
      }),
    );
    const invalidRange = findHistory.mock.calls[1]?.[1].dateRange;
    expect(invalidRange).toBeDefined();
    expect(Number.isNaN(invalidRange?.[0].getTime())).toBe(true);
    expect(Number.isNaN(invalidRange?.[1].getTime())).toBe(true);
  });
});
