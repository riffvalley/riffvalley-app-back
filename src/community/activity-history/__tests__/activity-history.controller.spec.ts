import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import * as request from 'supertest';
import { User } from '../../../identity/auth/entities/user.entity';
import { UserRoleGuard } from '../../../identity/authorization/guards/user-role/user-role.guard';
import { ActivityHistoryController } from '../activity-history.controller';
import { ActivityHistoryCursorService } from '../activity-history-cursor.service';
import { ActivityHistoryQueryDto } from '../dto/activity-history-query.dto';
import { ActivityHistoryService } from '../activity-history.service';
import { ActivityHistoryPage } from '../types/activity-history.types';

const event = {
  id: 'event-1',
  type: 'set' as const,
  occurredAt: '2026-10-29T09:10:11.123456Z',
  previousValue: null,
  newValue: 8.5,
  disc: {
    id: 'disc-1',
    title: 'Record',
    artist: null,
    coverUrl: null,
    genre: null,
  },
};

describe('ActivityHistoryController', () => {
  const user = { id: 'authenticated-user' };
  let controller: ActivityHistoryController;
  let service: jest.Mocked<Pick<ActivityHistoryService, 'findUserHistory'>>;

  beforeEach(() => {
    service = { findUserHistory: jest.fn() };
    controller = new ActivityHistoryController(
      service,
      new ActivityHistoryCursorService(
        new ConfigService({ JWT_SECRET: 'a'.repeat(48) }),
      ),
    );
  });

  it('is a guarded GET route at activity/history, distinct from Identity routes', () => {
    const routeGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      ActivityHistoryController.prototype.getHistory,
    ) as unknown[];
    expect(Reflect.getMetadata(PATH_METADATA, ActivityHistoryController)).toBe(
      'activity/history',
    );
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        ActivityHistoryController.prototype.getHistory,
      ),
    ).toBe(0);
    expect(routeGuards).toHaveLength(2);
    expect((routeGuards[0] as { name?: string }).name).toBeTruthy();
    expect((routeGuards[1] as { name?: string }).name).toBe(UserRoleGuard.name);
  });

  it('derives ownership from @GetUser, maps q to the service query and returns an empty final page', async () => {
    const page: ActivityHistoryPage = {
      items: [event],
      hasMore: false,
      nextPosition: null,
    };
    service.findUserHistory.mockResolvedValue(page);

    const result = await controller.getHistory(user, {
      from: undefined,
      to: undefined,
      timeZone: undefined,
      type: undefined,
      q: '  album  ',
      limit: 30,
      cursor: undefined,
    });

    expect(service.findUserHistory).toHaveBeenCalledWith('authenticated-user', {
      from: undefined,
      to: undefined,
      timeZone: undefined,
      type: undefined,
      query: '  album  ',
      limit: 30,
    });
    expect(result).toEqual({
      items: [event],
      nextCursor: null,
      hasMore: false,
    });
  });

  it('signs the service continuation and requests the next page with the same filters', async () => {
    const page: ActivityHistoryPage = {
      items: [event],
      hasMore: true,
      nextPosition: {
        after: {
          occurredAt: event.occurredAt,
          id: '123e4567-e89b-42d3-a456-426614174000',
        },
        anchor: {
          occurredAt: '2026-10-29T09:10:11.123457Z',
          id: '123e4567-e89b-42d3-a456-426614174001',
        },
      },
    };
    service.findUserHistory.mockResolvedValueOnce(page).mockResolvedValueOnce({
      items: [{ ...event, id: 'event-2' }],
      hasMore: false,
      nextPosition: null,
    });
    const first = await controller.getHistory(user, {
      from: undefined,
      to: undefined,
      timeZone: undefined,
      type: 'set',
      q: undefined,
      limit: 1,
      cursor: undefined,
    });
    const token = first.nextCursor;
    if (typeof token !== 'string')
      throw new Error('Expected a continuation cursor');

    const second = await controller.getHistory(user, {
      from: undefined,
      to: undefined,
      timeZone: undefined,
      type: 'set',
      q: undefined,
      limit: 1,
      cursor: token,
    });

    expect(service.findUserHistory).toHaveBeenLastCalledWith(
      'authenticated-user',
      expect.objectContaining({
        type: 'set',
        limit: 1,
        continuation: page.nextPosition,
      }),
    );
    expect(second).toEqual({
      items: [{ ...event, id: 'event-2' }],
      nextCursor: null,
      hasMore: false,
    });
  });
});

describe('ActivityHistoryQueryDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  async function validate(input: Record<string, unknown>) {
    return pipe.transform(input, {
      type: 'query',
      metatype: ActivityHistoryQueryDto,
      data: undefined,
    }) as Promise<ActivityHistoryQueryDto>;
  }

  it('defaults limit to 30 and converts decimal integer strings', async () => {
    await expect(validate({})).resolves.toEqual(
      expect.objectContaining({ limit: 30 }),
    );
    await expect(validate({ limit: '100' })).resolves.toEqual(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it.each([
    { from: '2026-02-30' },
    { from: '2026-01-01', timeZone: 'Not/AZone' },
    { from: '2026-01-02', to: '2026-01-01', timeZone: 'UTC' },
    { type: 'created' },
    { q: '   ' },
    { q: 'x'.repeat(101) },
    { limit: '1.2' },
    { limit: '1e2' },
    { limit: '+1' },
    { limit: ' 3' },
    { limit: '101' },
    { cursor: 'invalid token' },
    { cursor: '' },
    { userId: 'someone-else' },
  ])('rejects invalid public query %#', async (input) => {
    await expect(validate(input)).rejects.toThrow();
  });

  it('requires a time zone for date filters and accepts valid filters', async () => {
    await expect(validate({ to: '2026-10-29' })).rejects.toThrow();
    await expect(
      validate({
        from: '2026-10-29',
        to: '2026-10-30',
        timeZone: 'Europe/Madrid',
        type: 'change',
        q: '  Pink Floyd  ',
        limit: '30',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ q: 'Pink Floyd', limit: 30, type: 'change' }),
    );
  });
});

describe('ActivityHistory HTTP authentication', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let sessionUserId: string | undefined;
  const service = { findUserHistory: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionUserId = undefined;
    service.findUserHistory.mockResolvedValue({
      items: [event],
      hasMore: false,
      nextPosition: null,
    });
    moduleRef = await Test.createTestingModule({
      controllers: [ActivityHistoryController],
      providers: [
        { provide: ActivityHistoryService, useValue: service },
        ActivityHistoryCursorService,
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: 'a'.repeat(48) }),
        },
      ],
    })
      .overrideGuard(AuthGuard())
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => { user?: Pick<User, 'id'> };
          };
        }) => {
          if (!sessionUserId) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = { id: sessionUserId };
          return true;
        },
      })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects requests without an authenticated session', async () => {
    await request(app.getHttpServer()).get('/api/activity/history').expect(401);
    expect(service.findUserHistory).not.toHaveBeenCalled();
  });

  it('uses the identity provided by the authenticated session', async () => {
    sessionUserId = '123e4567-e89b-42d3-a456-426614174111';
    await request(app.getHttpServer())
      .get('/api/activity/history?type=set&limit=30')
      .expect(200, { items: [event], nextCursor: null, hasMore: false });
    expect(service.findUserHistory).toHaveBeenCalledWith(
      sessionUserId,
      expect.objectContaining({ type: 'set', limit: 30 }),
    );
  });

  it('rejects a malformed opaque cursor before calling the history service', async () => {
    sessionUserId = '123e4567-e89b-42d3-a456-426614174111';
    await request(app.getHttpServer())
      .get('/api/activity/history?cursor=bogus.value')
      .expect(400);
    expect(service.findUserHistory).not.toHaveBeenCalled();
  });
});
