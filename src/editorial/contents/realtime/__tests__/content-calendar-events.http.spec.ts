import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { AUTH_HTTP_CORS_OPTIONS } from 'src/identity/auth/session-http/session-http-cors';
import { JwtStrategy } from 'src/identity/auth/strategies/jwt.strategy';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { UsersService } from 'src/identity/users/users.service';
import { ContentCalendarEventPublisher } from '../content-calendar-event-publisher.service';
import { ContentCalendarEventsController } from '../content-calendar-events.controller';
import { ContentCalendarStreamService } from '../content-calendar-stream.service';
import { EditorialSseTransport } from 'src/editorial/realtime/editorial-sse-transport.service';

const JWT_SECRET = 'content-calendar-sse-http-test-secret';
const USER_ID = '73d38a0c-cb8a-49da-9421-c04d11112423';

describe('Content Calendar SSE HTTP endpoint', () => {
  let app: INestApplication;
  let appClosed: boolean;
  let baseUrl: string;
  let jwtService: JwtService;
  let identity: {
    role: ValidRoles;
    isActive: boolean;
    credentialVersion: number;
  };
  const usersService = {
    findById: jest.fn(),
    findIdentityById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    appClosed = false;
    identity = {
      role: ValidRoles.riffvalley,
      isActive: true,
      credentialVersion: 0,
    };
    usersService.findById.mockImplementation(async () => ({
      id: USER_ID,
      isActive: identity.isActive,
      credentialVersion: identity.credentialVersion,
    }));
    usersService.findIdentityById.mockImplementation(async () => ({
      id: USER_ID,
      role: identity.role,
      isActive: identity.isActive,
    }));

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      controllers: [ContentCalendarEventsController],
      providers: [
        ContentCalendarEventPublisher,
        EditorialSseTransport,
        ContentCalendarStreamService,
        JwtStrategy,
        UserRoleGuard,
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: { get: () => JWT_SECRET } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.enableCors(AUTH_HTTP_CORS_OPTIONS);
    await app.listen(0, '127.0.0.1');
    const address: string | AddressInfo | null = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('SSE test server did not bind to a TCP port');
    }
    baseUrl = `http://127.0.0.1:${address.port}/api/contents/events`;
    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    if (!appClosed) await app.close();
  });

  function token(credentialVersion = 0): string {
    return jwtService.sign({ id: USER_ID, credentialVersion });
  }

  async function requestStream(bearer?: string) {
    const abortController = new AbortController();
    const response = await fetch(baseUrl, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
      signal: abortController.signal,
    });
    return { response, abortController };
  }

  async function consumeInitialEvent(bearer: string): Promise<{
    response: Response;
    firstChunk: string;
    close: () => Promise<void>;
  }> {
    const { response, abortController } = await requestStream(bearer);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('SSE response has no readable body');
    const first = await reader.read();
    const firstChunk = first.value ? new TextDecoder().decode(first.value) : '';
    return {
      response,
      firstChunk,
      close: async () => {
        await reader.cancel();
        abortController.abort();
        for (let attempt = 0; attempt < 10; attempt += 1) {
          if (
            app.get(ContentCalendarStreamService).getMetrics()
              .activeConnections === 0
          ) {
            return;
          }
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      },
    };
  }

  it.each([
    ['missing Bearer', undefined],
    ['invalid Bearer', 'not-a-jwt'],
  ])('rejects %s with 401', async (_label, bearer) => {
    const { response } = await requestStream(bearer);

    expect(response.status).toBe(401);
    expect(
      app.get(ContentCalendarStreamService).getMetrics().activeConnections,
    ).toBe(0);
  });

  it.each([ValidRoles.user, ValidRoles.collaborator])(
    'rejects role %s with 403',
    async (role) => {
      identity.role = role;
      const { response } = await requestStream(token());

      expect(response.status).toBe(403);
      expect(
        app.get(ContentCalendarStreamService).getMetrics().activeConnections,
      ).toBe(0);
    },
  );

  it.each([ValidRoles.riffvalley, ValidRoles.superadmin])(
    'allows role %s through the existing role hierarchy',
    async (role) => {
      identity.role = role;
      const stream = await consumeInitialEvent(token());

      expect(stream.response.status).toBe(200);
      expect(stream.response.headers.get('content-type')).toBe(
        'text/event-stream; charset=utf-8',
      );
      expect(stream.response.headers.get('cache-control')).toBe(
        'no-cache, no-transform',
      );
      expect(stream.response.headers.get('connection')).toBe('keep-alive');
      expect(stream.response.headers.get('x-accel-buffering')).toBe('no');
      expect(stream.firstChunk).toBe(
        'event: contents.invalidate\ndata: {"type":"contents.invalidate","version":2,"reason":"initial"}\n\n',
      );
      expect(stream.firstChunk).not.toContain('id:');
      expect(stream.firstChunk).not.toMatch(
        /notes|author|title|publicationDate/i,
      );
      await stream.close();
      expect(
        app.get(ContentCalendarStreamService).getMetrics().activeConnections,
      ).toBe(0);
    },
  );

  it('rejects an inactive user and a token with an invalidated credential version', async () => {
    identity.isActive = false;
    const inactive = await requestStream(token());
    expect(inactive.response.status).toBe(401);

    identity.isActive = true;
    identity.credentialVersion = 4;
    const invalidated = await requestStream(token(3));
    expect(invalidated.response.status).toBe(401);
    expect(
      app.get(ContentCalendarStreamService).getMetrics().activeConnections,
    ).toBe(0);
  });

  it('allows the existing CORS allowlist to preflight Authorization and the client source ID', async () => {
    const response = await fetch(baseUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.riffvalley.es',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers':
          'authorization,x-content-calendar-client-id,x-riff-valley-client-id',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://app.riffvalley.es',
    );
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'Authorization',
    );
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'X-Content-Calendar-Client-Id',
    );
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'X-Riff-Valley-Client-Id',
    );
  });

  it('closes active streams before the HTTP server shutdown waits for them', async () => {
    const stream = await consumeInitialEvent(token());
    const streamService = app.get(ContentCalendarStreamService);

    await app.close();
    appClosed = true;

    expect(streamService.getMetrics().activeConnections).toBe(0);
    expect(streamService.getMetrics().connectionsClosed).toBe(1);
    await stream.close();
  });
});
