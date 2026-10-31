import {
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { validateSync } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { ActivityService } from '../../activity/activity.service';
import { ConfigService } from '@nestjs/config';
import { SessionsService } from '../../sessions/sessions.service';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { AuthRateLimitService } from '../rate-limiting/auth-rate-limit.service';
import { PasswordResetIpRateLimitGuard } from '../rate-limiting/password-reset-ip-rate-limit.guard';
import { AuthController } from '../auth.controller';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

describe('password recovery HTTP contract', () => {
  const response = { setHeader: jest.fn() };
  const config = {
    get: (key: string) =>
      key === 'AUTH_PASSWORD_RESET_URL'
        ? 'http://localhost:5173/reset-password'
        : key === 'STAGE'
          ? 'dev'
          : undefined,
  };

  beforeEach(() => response.setHeader.mockClear());

  function controller(options?: {
    active?: boolean;
    retryAfter?: number | null;
    consumeFailure?: Error;
  }) {
    const users = {
      findPasswordResetTargetByEmail: jest
        .fn()
        .mockResolvedValue(
          options?.active
            ? { id: 'user-id', email: 'listener@example.com', isActive: true }
            : null,
        ),
    };
    const reset = {
      assertConfigured: jest.fn(),
      createPendingRequest: jest
        .fn()
        .mockResolvedValue({ requestId: 'request-id' }),
      resetPassword: jest.fn().mockResolvedValue(undefined),
    };
    const rateLimit = {
      consume: options?.consumeFailure
        ? jest.fn().mockRejectedValue(options.consumeFailure)
        : jest.fn().mockResolvedValue(options?.retryAfter ?? null),
    };
    return {
      instance: new AuthController(
        {} as never,
        users as never,
        {} as never,
        config as never,
        {} as never,
        rateLimit as never,
        reset as never,
      ),
      users,
      reset,
      rateLimit,
    };
  }

  it('exposes public routes with the accepted/no-content status contract', () => {
    const prototype = AuthController.prototype;
    expect(Reflect.getMetadata(PATH_METADATA, prototype.forgotPassword)).toBe(
      'forgot-password',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.forgotPassword)).toBe(
      1,
    );
    expect(Reflect.getMetadata(PATH_METADATA, prototype.resetPassword)).toBe(
      'reset-password',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.resetPassword)).toBe(
      1,
    );
    expect(Reflect.getMetadata('__httpCode__', prototype.forgotPassword)).toBe(
      HttpStatus.ACCEPTED,
    );
    expect(Reflect.getMetadata('__httpCode__', prototype.resetPassword)).toBe(
      HttpStatus.NO_CONTENT,
    );
  });

  it.each([false, true])(
    'returns the same neutral response and no-store headers for account active=%s',
    async (active) => {
      const { instance, users, reset, rateLimit } = controller({ active });
      const result = await instance.forgotPassword(
        { email: 'Listener@Example.com' },
        response as never,
      );

      expect(result).toEqual({
        message: 'Si la cuenta existe, recibirás instrucciones.',
      });
      expect(users.findPasswordResetTargetByEmail).toHaveBeenCalledWith(
        'listener@example.com',
      );
      expect(reset.createPendingRequest).toHaveBeenCalledTimes(active ? 1 : 0);
      expect(rateLimit.consume).toHaveBeenCalledWith([
        expect.objectContaining({
          scope: 'password_reset_request_email',
          subject: 'listener@example.com',
          limit: 3,
          windowSeconds: 900,
        }),
      ]);
      expect(response.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store',
      );
    },
  );

  it('returns generic 429 with Retry-After and fails closed on limiter errors', async () => {
    const limited = controller({ retryAfter: 57 });
    await expect(
      limited.instance.forgotPassword(
        { email: 'a@example.com' },
        response as never,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '57');
    expect(limited.users.findPasswordResetTargetByEmail).not.toHaveBeenCalled();

    const unavailable = controller({
      consumeFailure: new ServiceUnavailableException(
        'Authentication controls are unavailable',
      ),
    });
    await expect(
      unavailable.instance.forgotPassword(
        { email: 'a@example.com' },
        response as never,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      unavailable.users.findPasswordResetTargetByEmail,
    ).not.toHaveBeenCalled();
    expect(unavailable.reset.resetPassword).not.toHaveBeenCalled();
  });

  it('consumes the token without producing a session response', async () => {
    const { instance, reset } = controller();
    await expect(
      instance.resetPassword(
        { token: 'a'.repeat(43), password: 'Strong1' },
        response as never,
      ),
    ).resolves.toBeUndefined();
    expect(reset.resetPassword).toHaveBeenCalledWith('a'.repeat(43), 'Strong1');
  });

  it('keeps enqueue failures neutral and excludes account data from logs', async () => {
    const { instance, reset } = controller({ active: true });
    reset.createPendingRequest.mockRejectedValueOnce(
      new Error('private persistence details'),
    );
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      instance.forgotPassword(
        { email: 'listener@example.com' },
        response as never,
      ),
    ).resolves.toEqual({
      message: 'Si la cuenta existe, recibirás instrucciones.',
    });
    const logged = warning.mock.calls
      .map(([message]) => String(message))
      .join('\n');
    expect(logged).not.toContain('listener@example.com');
    expect(logged).not.toContain('private persistence details');
    warning.mockRestore();
  });

  it('validates email, token shape and the established password policy', () => {
    expect(
      validateSync(Object.assign(new ForgotPasswordDto(), { email: 'bad' })),
    ).not.toHaveLength(0);
    expect(
      validateSync(
        Object.assign(new ResetPasswordDto(), {
          token: 'short',
          password: 'weak',
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      validateSync(
        Object.assign(new ResetPasswordDto(), {
          token: 'a'.repeat(43),
          password: 'Strong1',
        }),
      ),
    ).toHaveLength(0);
  });
});

describe('password recovery routed HTTP contract', () => {
  let app: import('@nestjs/common').INestApplication;
  const usersService = {
    findPasswordResetTargetByEmail: jest.fn().mockResolvedValue(null),
  };
  const resetService = {
    assertConfigured: jest.fn(),
    createPendingRequest: jest.fn(),
    resetPassword: jest.fn(),
  };
  const rateLimitService = { consume: jest.fn().mockResolvedValue(null) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: UsersService, useValue: usersService },
        { provide: ActivityService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'AUTH_PASSWORD_RESET_URL'
                ? 'http://localhost:5173/reset-password'
                : key === 'STAGE'
                  ? 'dev'
                  : undefined,
          },
        },
        { provide: SessionsService, useValue: {} },
        { provide: AuthRateLimitService, useValue: rateLimitService },
        { provide: PasswordResetService, useValue: resetService },
        PasswordResetIpRateLimitGuard,
      ],
    }).compile();
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

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.findPasswordResetTargetByEmail.mockResolvedValue(null);
    rateLimitService.consume.mockResolvedValue(null);
  });

  it('serves neutral accepted responses, no-store headers and DTO validation through HTTP', async () => {
    const accepted = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'unknown@example.com' })
      .expect(202);
    expect(accepted.body).toEqual({
      message: 'Si la cuenta existe, recibirás instrucciones.',
    });
    expect(accepted.headers['cache-control']).toBe('no-store');
    expect(accepted.headers.pragma).toBe('no-cache');

    const invalidForgot = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'invalid', extra: true })
      .expect(400);
    expect(invalidForgot.headers['cache-control']).toBe('no-store');
    const invalidReset = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'short', password: 'weak' })
      .expect(400);
    expect(invalidReset.headers['cache-control']).toBe('no-store');
    expect(rateLimitService.consume).toHaveBeenCalledTimes(4);
    expect(
      rateLimitService.consume.mock.calls.flatMap(([dimensions]) =>
        dimensions.map(({ scope }) => scope),
      ),
    ).toEqual([
      'password_reset_request_ip',
      'password_reset_request_email',
      'password_reset_request_ip',
      'password_reset_attempt_ip',
    ]);
  });

  it('returns generic IP 429 with Retry-After and fails closed before reset', async () => {
    rateLimitService.consume.mockResolvedValueOnce(37);
    const limited = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(43), password: 'Strong1' })
      .expect(429);
    expect(limited.headers['retry-after']).toBe('37');
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(resetService.resetPassword).not.toHaveBeenCalled();

    rateLimitService.consume.mockRejectedValueOnce(
      new Error('database detail'),
    );
    const unavailable = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(43), password: 'Strong1' })
      .expect(503);
    expect(unavailable.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(unavailable.body)).not.toContain('database detail');
    expect(resetService.resetPassword).not.toHaveBeenCalled();
  });

  it('returns 204 for reset success without issuing session data', async () => {
    resetService.resetPassword.mockResolvedValue(undefined);
    const result = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(43), password: 'Strong1' })
      .expect(204);
    expect(result.text).toBe('');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(resetService.resetPassword).toHaveBeenCalledWith(
      'a'.repeat(43),
      'Strong1',
    );
  });
});
