import { ForbiddenException } from '@nestjs/common';
import { ActivityController } from '../activity.controller';
import { ActivityService } from '../activity.service';
import { ActivityStatisticsService } from '../stats/activity-statistics.service';
import { ActivityInactivityService } from '../stats/activity-inactivity.service';

describe('ActivityController', () => {
  const activityService = {
    recordAppDailyActivity: jest.fn<Promise<void>, [string]>(),
  } satisfies Pick<ActivityService, 'recordAppDailyActivity'>;
  const activityStatisticsService = {
    findUsers: jest.fn(),
    getSummary: jest.fn(),
    getUserDetail: jest.fn(),
  } satisfies Pick<
    ActivityStatisticsService,
    'findUsers' | 'getSummary' | 'getUserDetail'
  >;
  const activityInactivityService = {
    getInactivity: jest.fn(),
  } satisfies Pick<ActivityInactivityService, 'getInactivity'>;
  let controller: ActivityController;

  beforeEach(() => {
    jest.clearAllMocks();
    activityService.recordAppDailyActivity.mockResolvedValue(undefined);
    controller = new ActivityController(
      activityService as never,
      activityStatisticsService as never,
      activityInactivityService as never,
    );
  });

  it('records the authenticated user for an App session', async () => {
    await expect(
      controller.recordAppDailyActivity({ id: 'user-1' } as never, 'app'),
    ).resolves.toBeUndefined();

    expect(activityService.recordAppDailyActivity).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it.each(['wiki', undefined, 'app-from-request-body'])(
    'rejects non-App attribution (%s)',
    async (clientType) => {
      await expect(
        controller.recordAppDailyActivity(
          { id: 'user-1' } as never,
          clientType,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(activityService.recordAppDailyActivity).not.toHaveBeenCalled();
    },
  );

  it('keeps the route protected by the standard authentication guards', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      ActivityController.prototype.recordAppDailyActivity,
    ) as unknown[];

    expect(guards).toHaveLength(2);
  });

  it('delegates inactivity queries to the inactivity statistics service', async () => {
    const result = { totalUsers: 1 };
    activityInactivityService.getInactivity.mockResolvedValue(result);
    const query = { asOf: '2026-10-24', limit: 10 };

    await expect(controller.getInactivity(query)).resolves.toBe(result);
    expect(activityInactivityService.getInactivity).toHaveBeenCalledWith(query);
    expect(
      Reflect.getMetadata(
        '__guards__',
        ActivityController.prototype.getInactivity,
      ),
    ).toHaveLength(2);
  });
});
