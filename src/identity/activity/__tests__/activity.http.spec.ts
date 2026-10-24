import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { User } from '../../auth/entities/user.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { UserRoleGuard } from '../../authorization/guards/user-role/user-role.guard';
import { JwtStrategy } from '../../authorization/strategies/jwt.strategy';
import { ValidRoles } from '../../authorization/interfaces/valid-roles';
import { ActivityController } from '../activity.controller';
import { ActivityService } from '../activity.service';
import { ActivityStatisticsService } from '../stats/activity-statistics.service';

describe('App daily activity HTTP authorization', () => {
  const secret = 'app-daily-activity-http-test-secret';
  const activityService = { recordAppDailyActivity: jest.fn() };
  const usersService = {
    findById: jest.fn<Promise<User | null>, [string]>(),
    findIdentityById: jest.fn<Promise<User | null>, [string]>(),
  };
  const activityStatisticsService = {
    findUsers: jest.fn(),
    getSummary: jest.fn(),
    getUserDetail: jest.fn(),
  };
  let app: INestApplication;
  let moduleRef: TestingModule;
  let jwtService: JwtService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret }),
      ],
      controllers: [ActivityController],
      providers: [
        JwtStrategy,
        UserRoleGuard,
        { provide: UsersService, useValue: usersService },
        {
          provide: ConfigService,
          useValue: { get: () => secret },
        },
        { provide: ActivityService, useValue: activityService },
        {
          provide: ActivityStatisticsService,
          useValue: activityStatisticsService,
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => app?.close());

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.findById.mockImplementation(
      async (id) =>
        ({
          id,
          username: id === 'admin-1' ? 'admin' : 'listener',
          role: id === 'admin-1' ? ValidRoles.superadmin : ValidRoles.user,
          isActive: true,
        }) as User,
    );
    usersService.findIdentityById.mockImplementation(
      async (id) =>
        ({
          id,
          username: id === 'admin-1' ? 'admin' : 'listener',
          role: id === 'admin-1' ? ValidRoles.superadmin : ValidRoles.user,
          isActive: true,
        }) as User,
    );
    activityService.recordAppDailyActivity.mockResolvedValue(undefined);
    activityStatisticsService.findUsers.mockResolvedValue({ data: [] });
    activityStatisticsService.getSummary.mockResolvedValue({ series: [] });
    activityStatisticsService.getUserDetail.mockResolvedValue({
      userId: '00000000-0000-4000-8000-000000000001',
    });
  });

  function postWithToken(payload: JwtPayload) {
    const token = jwtService.sign(payload);
    return request(app.getHttpServer())
      .post('/activity/app/daily')
      .set('Authorization', `Bearer ${token}`);
  }

  function getWithToken(path: string, payload: JwtPayload) {
    const token = jwtService.sign(payload);
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);
  }

  it('rejects requests without an access token', async () => {
    await request(app.getHttpServer()).post('/activity/app/daily').expect(401);

    expect(activityService.recordAppDailyActivity).not.toHaveBeenCalled();
  });

  it('rejects a signed Wiki token', async () => {
    await postWithToken({
      id: 'user-1',
      username: 'listener',
      role: ValidRoles.user,
      clientType: 'wiki',
    }).expect(403);

    expect(activityService.recordAppDailyActivity).not.toHaveBeenCalled();
  });

  it('accepts an App token and derives the user from its validated subject', async () => {
    await postWithToken({
      id: 'user-1',
      username: 'listener',
      role: ValidRoles.user,
      clientType: 'app',
    }).expect(204);

    expect(usersService.findById).toHaveBeenCalledWith('user-1');
    expect(activityService.recordAppDailyActivity).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('restricts activity statistics to superadmins', async () => {
    await getWithToken('/activity/summary', {
      id: 'user-1',
      username: 'listener',
      role: ValidRoles.user,
    }).expect(403);
    expect(activityStatisticsService.getSummary).not.toHaveBeenCalled();

    await getWithToken('/activity/summary?from=2026-10-01&to=2026-10-22', {
      id: 'admin-1',
      username: 'admin',
      role: ValidRoles.superadmin,
    })
      .expect(200)
      .expect({ series: [] });
    expect(activityStatisticsService.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-10-01', to: '2026-10-22' }),
    );
  });

  it('returns the full additive dashboard contract and preserves legacy fields', async () => {
    const coverage = {
      current: { status: 'complete', dataSince: '2026-10-01' },
      previous: { status: 'complete', dataSince: '2026-10-01' },
    };
    const metric = {
      current: 2,
      previous: 1,
      delta: 1,
      changePercent: 100,
      coverage,
    };
    const summary = {
      from: '2026-10-22',
      to: '2026-10-22',
      timezone: 'Europe/Madrid',
      activityDataSince: '2026-10-01',
      voteDataSince: '2026-10-01',
      periods: {
        activeUsers7: 3,
        activeUsers30: 8,
        voteActions7: 4,
        voteActions30: 9,
        votingUsers7: 2,
        votingUsers30: 5,
      },
      series: [
        {
          date: '2026-10-22',
          activeUsers: 2,
          voteActions: 3,
          votingUsers: 1,
        },
      ],
      dashboard: {
        periods: {
          current: { from: '2026-10-22', to: '2026-10-22' },
          previous: { from: '2026-10-21', to: '2026-10-21' },
          baseline: { from: '2026-10-20', to: '2026-10-20' },
        },
        timezone: 'Europe/Madrid',
        asOf: '2026-10-23T00:00:00.000Z',
        activityDataSince: '2026-10-01',
        voteDataSince: '2026-10-01',
        activeUsers: metric,
        newVotes: metric,
        votingUsers: metric,
        participationRate: metric,
        votesPerActiveUser: metric,
        returningUsers: {
          ...metric,
          coverage: {
            ...coverage,
            baseline: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        retentionRate: {
          ...metric,
          coverage: {
            ...coverage,
            baseline: { status: 'complete', dataSince: '2026-10-01' },
          },
        },
        currentRatings: {
          current: 12,
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
              activeUsers: 2,
              newVotes: 3,
            },
          ],
          previous: [
            {
              date: '2026-10-21',
              dayIndex: 1,
              activeUsers: 1,
              newVotes: 1,
            },
          ],
        },
      },
    };
    activityStatisticsService.getSummary.mockResolvedValueOnce(summary);

    await getWithToken('/activity/summary?period=7', {
      id: 'admin-1',
      username: 'admin',
      role: ValidRoles.superadmin,
    })
      .expect(200)
      .expect(summary);

    expect(activityStatisticsService.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({ period: 7 }),
    );
  });

  it('accepts a preset and rejects mixed or unsupported summary ranges', async () => {
    await getWithToken('/activity/summary?period=7', {
      id: 'admin-1',
      username: 'admin',
      role: ValidRoles.superadmin,
    }).expect(200);
    expect(activityStatisticsService.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({ period: 7 }),
    );

    await getWithToken('/activity/summary?period=7&from=2026-10-01', {
      id: 'admin-1',
      username: 'admin',
      role: ValidRoles.superadmin,
    }).expect(400);
    await getWithToken('/activity/summary?period=14', {
      id: 'admin-1',
      username: 'admin',
      role: ValidRoles.superadmin,
    }).expect(400);
  });
});
