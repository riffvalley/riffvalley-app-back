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
import { ActivityInactivityService } from '../stats/activity-inactivity.service';

describe('GET /activity/inactivity HTTP contract', () => {
  const secret = 'activity-inactivity-http-test-secret';
  const activityService = { recordAppDailyActivity: jest.fn() };
  const activityStatisticsService = {
    findUsers: jest.fn(),
    getSummary: jest.fn(),
    getUserDetail: jest.fn(),
  };
  const activityInactivityService = { getInactivity: jest.fn() };
  const usersService = {
    findById: jest.fn<Promise<User | null>, [string]>(),
    findIdentityById: jest.fn<Promise<User | null>, [string]>(),
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
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: ActivityService, useValue: activityService },
        {
          provide: ActivityStatisticsService,
          useValue: activityStatisticsService,
        },
        {
          provide: ActivityInactivityService,
          useValue: activityInactivityService,
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
    const resolveUser = async (id: string) =>
      ({
        id,
        username: id === 'admin-1' ? 'admin' : 'listener',
        role: id === 'admin-1' ? ValidRoles.superadmin : ValidRoles.user,
        isActive: true,
      }) as User;
    usersService.findById.mockImplementation(resolveUser);
    usersService.findIdentityById.mockImplementation(resolveUser);
    activityInactivityService.getInactivity.mockResolvedValue({
      totalUsers: 0,
    });
  });

  function getWithRole(path: string, role: ValidRoles) {
    const payload: JwtPayload = {
      id: role === ValidRoles.superadmin ? 'admin-1' : 'user-1',
      username: role === ValidRoles.superadmin ? 'admin' : 'listener',
      role,
    };
    const token = jwtService.sign(payload);
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);
  }

  it('requires superadmin access', async () => {
    await request(app.getHttpServer()).get('/activity/inactivity').expect(401);
    await getWithRole('/activity/inactivity', ValidRoles.user).expect(403);
    expect(activityInactivityService.getInactivity).not.toHaveBeenCalled();
  });

  it('validates date, role, account state, pagination, and sort query values', async () => {
    const admin = ValidRoles.superadmin;
    await getWithRole('/activity/inactivity?asOf=2026-02-30', admin).expect(
      400,
    );
    await getWithRole('/activity/inactivity?role=owner', admin).expect(400);
    await getWithRole('/activity/inactivity?isActive=yes', admin).expect(400);
    await getWithRole('/activity/inactivity?limit=101', admin).expect(400);
    await getWithRole('/activity/inactivity?sortBy=createdAt', admin).expect(
      400,
    );
    expect(activityInactivityService.getInactivity).not.toHaveBeenCalled();
  });

  it('passes validated filters and pagination to the service', async () => {
    await getWithRole(
      '/activity/inactivity?asOf=2026-10-24&role=collaborator&isActive=false&limit=5&offset=10&sortBy=username&sortOrder=desc',
      ValidRoles.superadmin,
    ).expect(200);

    expect(activityInactivityService.getInactivity).toHaveBeenCalledWith(
      expect.objectContaining({
        asOf: '2026-10-24',
        role: ValidRoles.collaborator,
        isActive: 'false',
        limit: 5,
        offset: 10,
        sortBy: 'username',
        sortOrder: 'desc',
      }),
    );
  });
});
