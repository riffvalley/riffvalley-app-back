import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
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
});
