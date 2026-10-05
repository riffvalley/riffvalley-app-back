import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';
import { RatesStatsService } from './rates-stats.service';

describe('RatesController home insights route', () => {
  it('registers authenticated GET /rates/home-insights before the generic GET /rates/:id route', async () => {
    const ratesService = {} as RatesService;
    const ratesStatsService = { getHomeInsights: jest.fn().mockResolvedValue({ topArtists: [], countries: [] }) } as unknown as RatesStatsService;
    const controller = new RatesController(ratesService, ratesStatsService);
    const handler = RatesController.prototype.getHomeInsights;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as Function[];

    expect(Reflect.getMetadata(PATH_METADATA, RatesController)).toBe('rates');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('home-insights');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(guards).toHaveLength(2);
    expect(guards).toContain(UserRoleGuard);
    expect(guards[0]).not.toBe(UserRoleGuard);
    expect(typeof guards[0].prototype.canActivate).toBe('function');
    const userArgument = Object.values(
      Reflect.getMetadata(ROUTE_ARGS_METADATA, RatesController, 'getHomeInsights') as Record<string, any>,
    )[0];
    expect(userArgument).toMatchObject({ index: 0, data: undefined });

    const user = { id: 'token-user-id' } as any;
    await controller.getHomeInsights(user);
    expect(ratesStatsService.getHomeInsights).toHaveBeenCalledWith(user);
    expect(RatesController.prototype.findOne).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, RatesController.prototype.findOne)).toBe(':id');
  });

  it('preserves the methods, paths and current authentication decorators on the remaining routes', () => {
    const routes = [
      ['getUserStats', RequestMethod.GET, 'stats', true],
      ['getUserHistoryQB', RequestMethod.GET, 'user/:userId/history', false],
      ['findRatesByDisc', RequestMethod.GET, 'disc/:discId', false],
      ['create', RequestMethod.POST, '/', true],
      ['findAll', RequestMethod.GET, '/', true],
      ['findOne', RequestMethod.GET, ':id', false],
      ['update', RequestMethod.PATCH, ':id', true],
      ['remove', RequestMethod.DELETE, ':id', true],
    ] as const;

    for (const [name, method, path, authenticated] of routes) {
      const handler = RatesController.prototype[name];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Boolean(guards)).toBe(authenticated);
      if (authenticated) expect(Reflect.getMetadata(META_ROLES, handler)).toEqual([]);
    }
  });
});
