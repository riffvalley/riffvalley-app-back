import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { JwtStrategy } from 'src/identity/auth/strategies/jwt.strategy';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { UsersService } from 'src/identity/users/users.service';
import { ListsController } from '../../list.controller';
import { ListsService } from '../../list.service';
import { ListsEventPublisher } from '../lists-event-publisher.service';
import { ListsStreamService } from '../lists-stream.service';
import { EditorialSseTransport } from 'src/editorial/realtime/editorial-sse-transport.service';

const JWT_SECRET = 'lists-sse-http-test-secret';
const USER_ID = '73d38a0c-cb8a-49da-9421-c04d11112423';

describe('Lists SSE HTTP endpoint', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwtService: JwtService;
  let appClosed: boolean;
  let role: ValidRoles;
  const usersService = {
    findById: jest.fn(),
    findIdentityById: jest.fn(),
  };

  beforeEach(async () => {
    appClosed = false;
    role = ValidRoles.riffvalley;
    usersService.findById.mockImplementation(async () => ({
      id: USER_ID,
      isActive: true,
      credentialVersion: 0,
    }));
    usersService.findIdentityById.mockImplementation(async () => ({
      id: USER_ID,
      role,
      isActive: true,
    }));
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      controllers: [ListsController],
      providers: [
        ListsEventPublisher,
        EditorialSseTransport,
        ListsStreamService,
        { provide: ListsService, useValue: {} },
        JwtStrategy,
        UserRoleGuard,
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: { get: () => JWT_SECRET } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const address: string | AddressInfo | null = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('Lists SSE test server did not bind to a TCP port');
    }
    baseUrl = `http://127.0.0.1:${address.port}/api/lists/events`;
    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    if (!appClosed) await app.close();
  });

  function token(): string {
    return jwtService.sign({ id: USER_ID, credentialVersion: 0 });
  }

  it.each([undefined, 'invalid-token'])(
    'rejects missing or invalid Bearer with 401',
    async (bearer) => {
      const response = await fetch(baseUrl, {
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
      });
      expect(response.status).toBe(401);
    },
  );

  it.each([ValidRoles.user, ValidRoles.collaborator])(
    'rejects insufficient role %s with 403',
    async (insufficientRole) => {
      role = insufficientRole;
      const response = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      expect(response.status).toBe(403);
    },
  );

  it.each([ValidRoles.riffvalley, ValidRoles.superadmin])(
    'opens the global stream for %s and sends the v1 initial event',
    async (allowedRole) => {
      role = allowedRole;
      const abortController = new AbortController();
      const response = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${token()}` },
        signal: abortController.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        'text/event-stream; charset=utf-8',
      );
      expect(response.headers.get('cache-control')).toBe(
        'no-cache, no-transform',
      );
      expect(response.headers.get('x-accel-buffering')).toBe('no');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Lists SSE response has no readable body');
      const first = await reader.read();
      expect(first.value ? new TextDecoder().decode(first.value) : '').toBe(
        'event: lists.invalidate\ndata: {"type":"lists.invalidate","version":1,"reason":"initial"}\n\n',
      );
      await reader.cancel();
      abortController.abort();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (app.get(ListsStreamService).getMetrics().activeConnections === 0) {
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(app.get(ListsStreamService).getMetrics().activeConnections).toBe(
        0,
      );
      expect(app.get(ListsEventPublisher).getMetrics().activeSubscribers).toBe(
        0,
      );
    },
  );

  it('registers the static events route before the dynamic list id route', async () => {
    const response = await fetch(baseUrl);
    expect(response.status).toBe(401);
  });

  it('closes the stream and releases its subscriber on application shutdown', async () => {
    const abortController = new AbortController();
    const response = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${token()}` },
      signal: abortController.signal,
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Lists SSE response has no readable body');
    await reader.read();
    expect(app.get(ListsEventPublisher).getMetrics().activeSubscribers).toBe(1);

    await app.close();
    appClosed = true;
    expect(app.get(ListsStreamService).getMetrics().activeConnections).toBe(0);
    expect(app.get(ListsEventPublisher).getMetrics().activeSubscribers).toBe(0);
    await reader.cancel().catch(() => undefined);
    abortController.abort();
  });
});
