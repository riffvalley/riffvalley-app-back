import {
  Controller,
  Logger,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import {
  AUTH_SESSION_MODE_HEADER,
  AUTH_SESSION_MODE,
  SessionLoginResponseDto,
  SessionRefreshResponseDto,
} from './dto/session-auth-contract.dto';
import { GetUser } from './decorators/get-user.decorator';
import { User } from './entities/user.entity';
import { ValidRoles } from './interfaces/valid-roles';
import { Auth } from './decorators/auth.decorator';
import { AdminUpdateUserDto, UpdateUserDto } from './dto/update-user.dto';
import { ActivityListQueryDto } from 'src/identity/activity/dto/activity-list-query.dto';
import { UsersService } from '../users/users.service';
import { ActivityService } from '../activity/activity.service';
import {
  createClientLogoutCsrfVerifier,
  createLoginCsrfToken,
  createLoginCsrfVerifier,
  createSessionCsrfToken,
  createSessionCsrfVerifier,
} from './session-http/session-http-csrf';
import {
  readSessionCookieRequestMetadata,
  SessionClientOrigins,
  validateSessionCookieRequestMetadata,
  validateSessionCookieRequest,
  validateSessionCsrfBootstrapRequest,
  resolveSessionClientFromOrigin,
  SessionRequestRejectionReason,
} from './session-http/session-http-security';
import { SessionRefreshCookieAdapter } from './session-http/session-refresh-cookie-adapter';
import { SessionLoginCsrfCookieAdapter } from './session-http/session-login-csrf-cookie';
import { SessionsService } from '../sessions/sessions.service';
import { SessionClientType } from '../sessions/entities/auth-session.entity';
import { AuthRateLimitService } from './rate-limiting/auth-rate-limit.service';
import {
  AUTH_RATE_LIMIT_POLICY,
  AuthRateLimitDimension,
} from './rate-limiting/auth-rate-limit-policy';
import {
  resolveAuthRateLimitClientAddress,
  SESSION_EDGE_SECRET_CONFIG_KEY,
} from './session-http/session-http-security';

const REFRESH_OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly activityService: ActivityService,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  @Post('register')
  create(@Body() createUserDto: CreateUserDto) {
    return this.authService.create(createUserDto);
  }

  @Post('login')
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Headers(AUTH_SESSION_MODE_HEADER) sessionMode?: string,
    @Req() request?: Request,
    @Res({ passthrough: true }) httpResponse?: Response,
  ) {
    this.setNoStoreHeaders(httpResponse);
    this.assertSessionModeEnabled();
    if (sessionMode !== AUTH_SESSION_MODE) {
      throw new ServiceUnavailableException('Session login is not available');
    }
    if (!request || !httpResponse) {
      throw new ServiceUnavailableException('Session login is not available');
    }
    const metadata = readSessionCookieRequestMetadata(
      request,
      this.configService,
    );
    const nonce = this.loginCsrfCookie.readNonce(request.headers.cookie);
    const csrfVerifier = createLoginCsrfVerifier(
      this.configService.get<string>('JWT_SECRET'),
      nonce,
    );
    const clientType = validateSessionCookieRequest(
      metadata,
      this.sessionOrigins(),
      csrfVerifier,
    );
    this.authService.resolveSessionLoginClient({
      mode: sessionMode,
      origin: metadata.origin,
    });
    await this.enforceRateLimit(
      [
        this.loginAccountLimit(loginUserDto.username),
        this.loginIpLimit(request),
      ],
      httpResponse,
    );

    const session = await this.authService.loginWithSession(loginUserDto, {
      mode: sessionMode,
      origin: metadata.origin,
    });
    this.refreshCookie.emitRefreshToken(
      httpResponse,
      clientType,
      session.refreshCredential.refreshToken,
      session.refreshCredential.expiresAt,
      metadata,
      this.sessionOrigins(),
      csrfVerifier,
    );
    httpResponse.status(200);

    return plainToInstance(
      SessionLoginResponseDto,
      {
        ...session.user,
        token: session.accessToken,
        csrfToken: this.createRefreshCsrfToken(
          clientType,
          session.refreshCredential.sessionId,
          session.refreshCredential.expiresAt,
        ),
        logoutCsrfToken: this.createSessionCsrfTokenForOperation(
          'logout',
          clientType,
          session.refreshCredential.sessionId,
          session.refreshCredential.expiresAt,
        ),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Get('csrf')
  async getSessionCsrfBootstrap(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ csrfToken: string }> {
    this.setNoStoreHeaders(response);
    this.assertSessionModeEnabled();
    const metadata = readSessionCookieRequestMetadata(
      request,
      this.configService,
    );
    const clientType = validateSessionCsrfBootstrapRequest(
      metadata,
      this.sessionOrigins(),
    );
    await this.enforceIpRateLimit(
      response,
      `csrf_bootstrap_ip_${clientType}`,
      AUTH_RATE_LIMIT_POLICY.csrfBootstrapIp.limit,
      AUTH_RATE_LIMIT_POLICY.csrfBootstrapIp.windowSeconds,
      request,
    );
    const nonce = randomBytes(32).toString('base64url');
    const now = Date.now();
    const csrfToken = createLoginCsrfToken(
      this.configService.get<string>('JWT_SECRET'),
      clientType,
      nonce,
      now + 10 * 60 * 1000,
      now,
    );
    if (!csrfToken) {
      throw new ServiceUnavailableException('CSRF bootstrap is not available');
    }

    this.loginCsrfCookie.issue(response, nonce);
    return { csrfToken };
  }

  @Post('refresh')
  async refresh(
    @Headers(AUTH_SESSION_MODE_HEADER) sessionMode: string | undefined,
    @Headers('x-refresh-operation')
    operationIdHeader: string | string[] | undefined,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) httpResponse: Response,
  ): Promise<SessionRefreshResponseDto> {
    this.setNoStoreHeaders(httpResponse);
    this.assertSessionModeEnabled();
    if (sessionMode !== AUTH_SESSION_MODE) {
      throw new ServiceUnavailableException('Session refresh is not available');
    }
    if (!isEmptyRefreshBody(body)) {
      throw new BadRequestException('Refresh request is not valid');
    }

    const metadata = readSessionCookieRequestMetadata(
      request,
      this.configService,
    );
    const origins = this.sessionOrigins();
    const resolvedClientType =
      resolveSessionClientFromOrigin(metadata.origin, origins) ?? undefined;
    const onRejected = (reason: SessionRequestRejectionReason): void =>
      this.logRefreshRejection(
        request,
        reason,
        resolvedClientType,
        operationIdHeader,
      );
    const clientType = validateSessionCookieRequestMetadata(
      metadata,
      origins,
      onRejected,
    );
    await this.enforceIpRateLimit(
      httpResponse,
      `refresh_ip_${clientType}`,
      AUTH_RATE_LIMIT_POLICY.refreshIp.limit,
      AUTH_RATE_LIMIT_POLICY.refreshIp.windowSeconds,
      request,
    );
    const refreshToken = this.refreshCookie.readRefreshTokenForValidatedClient(
      request.headers.cookie,
      clientType,
    );
    if (!refreshToken) {
      throw new UnauthorizedException('Session is not available');
    }

    const binding = await this.sessionsService.findRefreshTokenSessionBinding(
      refreshToken,
      clientType,
    );
    if (!binding) {
      throw new UnauthorizedException('Session is not available');
    }

    const csrfVerifier = createSessionCsrfVerifier(
      this.configService.get<string>('JWT_SECRET'),
      'refresh',
      binding.sessionId,
    );
    const resolvedClient = validateSessionCookieRequest(
      metadata,
      origins,
      csrfVerifier,
      onRejected,
    );
    if (resolvedClient !== binding.clientType) {
      throw new UnauthorizedException('Session is not available');
    }
    await this.enforceRateLimit(
      [
        {
          scope: `refresh_session_${clientType}`,
          subject: binding.sessionId,
          limit: AUTH_RATE_LIMIT_POLICY.refreshSession.limit,
          windowSeconds: AUTH_RATE_LIMIT_POLICY.refreshSession.windowSeconds,
        },
      ],
      httpResponse,
    );

    const operationId =
      typeof operationIdHeader === 'string' ? operationIdHeader : '';
    if (!REFRESH_OPERATION_ID_PATTERN.test(operationId)) {
      throw new BadRequestException('Refresh operation is not valid');
    }

    let session: Awaited<ReturnType<AuthService['refreshWithSession']>>;
    try {
      session = await this.authService.refreshWithSession(
        refreshToken,
        operationId,
        { mode: sessionMode, origin: metadata.origin },
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        onRejected('origin_invalid');
      }
      throw error;
    }
    this.refreshCookie.emitRefreshToken(
      httpResponse,
      clientType,
      session.refreshCredential.refreshToken,
      session.refreshCredential.expiresAt,
      metadata,
      origins,
      createSessionCsrfVerifier(
        this.configService.get<string>('JWT_SECRET'),
        'refresh',
        session.refreshCredential.sessionId,
      ),
      undefined,
      onRejected,
    );
    httpResponse.status(200);

    return plainToInstance(
      SessionRefreshResponseDto,
      {
        token: session.accessToken,
        csrfToken: this.createRefreshCsrfToken(
          clientType,
          session.refreshCredential.sessionId,
          session.refreshCredential.expiresAt,
        ),
        logoutCsrfToken: this.createSessionCsrfTokenForOperation(
          'logout',
          clientType,
          session.refreshCredential.sessionId,
          session.refreshCredential.expiresAt,
        ),
        expiresAt: session.refreshCredential.expiresAt.toISOString(),
        user: session.user,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Post('logout')
  async logout(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) httpResponse: Response,
  ): Promise<void> {
    this.setNoStoreHeaders(httpResponse);
    this.assertSessionModeEnabled();
    if (!isEmptyRefreshBody(body)) {
      throw new BadRequestException('Logout request is not valid');
    }

    const metadata = readSessionCookieRequestMetadata(
      request,
      this.configService,
    );
    const origins = this.sessionOrigins();
    const clientType = validateSessionCookieRequestMetadata(metadata, origins);
    await this.enforceIpRateLimit(
      httpResponse,
      `logout_ip_${clientType}`,
      AUTH_RATE_LIMIT_POLICY.logoutIp.limit,
      AUTH_RATE_LIMIT_POLICY.logoutIp.windowSeconds,
      request,
    );
    const refreshToken = this.refreshCookie.readRefreshTokenForValidatedClient(
      request.headers.cookie,
      clientType,
    );
    const binding = refreshToken
      ? await this.sessionsService.findRefreshTokenSessionBinding(
          refreshToken,
          clientType,
        )
      : null;
    const csrfVerifier = binding
      ? createSessionCsrfVerifier(
          this.configService.get<string>('JWT_SECRET'),
          'logout',
          binding.sessionId,
        )
      : createClientLogoutCsrfVerifier(
          this.configService.get<string>('JWT_SECRET'),
        );

    const resolvedClient = validateSessionCookieRequest(
      metadata,
      origins,
      csrfVerifier,
    );
    if (
      resolvedClient !== clientType ||
      (binding !== null && binding.clientType !== clientType)
    ) {
      throw new ForbiddenException('Request is not allowed');
    }

    if (binding) {
      await this.enforceRateLimit(
        [
          {
            scope: `logout_session_${clientType}`,
            subject: binding.sessionId,
            limit: AUTH_RATE_LIMIT_POLICY.logoutSession.limit,
            windowSeconds: AUTH_RATE_LIMIT_POLICY.logoutSession.windowSeconds,
          },
        ],
        httpResponse,
      );
      await this.sessionsService.revokeSession({
        sessionId: binding.sessionId,
        userId: binding.userId,
        clientType,
      });
    }

    this.refreshCookie.clearRefreshToken(
      httpResponse,
      clientType,
      metadata,
      origins,
      csrfVerifier,
    );
    httpResponse.status(204);
  }

  private setNoStoreHeaders(response: Response | undefined): void {
    response?.setHeader('Cache-Control', 'no-store');
    response?.setHeader('Pragma', 'no-cache');
  }

  private logRefreshRejection(
    request: Request,
    reason: SessionRequestRejectionReason,
    clientType: SessionClientType | undefined,
    operationIdHeader: string | string[] | undefined,
  ): void {
    const requestId = request.headers['x-request-id'];
    const safeRequestId =
      typeof requestId === 'string' && REQUEST_ID_PATTERN.test(requestId)
        ? ` request_id=${requestId}`
        : '';
    const safeOperationId =
      typeof operationIdHeader === 'string' &&
      REFRESH_OPERATION_ID_PATTERN.test(operationIdHeader)
        ? ` operation_id=${operationIdHeader}`
        : '';
    this.logger.warn(
      `security_event=auth_refresh_rejected endpoint=/api/auth/refresh status=403 reason=${reason} client_type=${clientType ?? 'unknown'} occurred_at=${new Date().toISOString()}${safeRequestId}${safeOperationId}`,
    );
  }

  private loginAccountLimit(username: string): AuthRateLimitDimension {
    return {
      scope: 'login_account',
      subject: username.normalize('NFKC').trim().toLocaleLowerCase('en-US'),
      limit: AUTH_RATE_LIMIT_POLICY.loginAccount.limit,
      windowSeconds: AUTH_RATE_LIMIT_POLICY.loginAccount.windowSeconds,
    };
  }

  private loginIpLimit(request: Request | undefined): AuthRateLimitDimension {
    return {
      scope: 'login_ip',
      subject: this.clientAddress(request),
      limit: AUTH_RATE_LIMIT_POLICY.loginIp.limit,
      windowSeconds: AUTH_RATE_LIMIT_POLICY.loginIp.windowSeconds,
    };
  }

  private async enforceIpRateLimit(
    response: Response,
    scope: string,
    limit: number,
    windowSeconds: number,
    request: Request,
  ): Promise<void> {
    await this.enforceRateLimit(
      [{ scope, subject: this.clientAddress(request), limit, windowSeconds }],
      response,
    );
  }

  private clientAddress(request: Request | undefined): string {
    const address = request
      ? resolveAuthRateLimitClientAddress(
          request,
          this.configService.get<string>(SESSION_EDGE_SECRET_CONFIG_KEY),
        )
      : null;
    if (!address) {
      throw new ServiceUnavailableException(
        'Authentication controls are unavailable',
      );
    }
    return address;
  }

  private async enforceRateLimit(
    dimensions: readonly AuthRateLimitDimension[],
    response: Response | undefined,
  ): Promise<void> {
    let retryAfter: number | null;
    try {
      retryAfter = await this.authRateLimitService.consume(dimensions);
    } catch (error) {
      this.setNoStoreHeaders(response);
      throw error;
    }
    if (retryAfter === null) return;
    this.setNoStoreHeaders(response);
    response?.setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      'Authentication request is not available',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private readonly refreshCookie = new SessionRefreshCookieAdapter();
  private readonly loginCsrfCookie = new SessionLoginCsrfCookieAdapter();

  private assertSessionModeEnabled(): void {
    if (
      this.configService.get<string>('AUTH_SESSION_MODE_ENABLED') !== 'true'
    ) {
      throw new ServiceUnavailableException('Session mode is not available');
    }
  }

  private sessionOrigins(): SessionClientOrigins {
    return {
      app: this.configService.get<string>('AUTH_SESSION_APP_ORIGIN'),
      wiki: this.configService.get<string>('AUTH_SESSION_WIKI_ORIGIN'),
    };
  }

  private createRefreshCsrfToken(
    clientType: SessionClientType,
    sessionId: string,
    sessionExpiresAt: Date,
  ): string {
    return this.createSessionCsrfTokenForOperation(
      'refresh',
      clientType,
      sessionId,
      sessionExpiresAt,
    );
  }

  private createSessionCsrfTokenForOperation(
    operation: 'refresh' | 'logout',
    clientType: SessionClientType,
    sessionId: string,
    sessionExpiresAt: Date,
  ): string {
    const now = Date.now();
    const csrfExpiresAt = now + 30 * 60 * 1000;
    const expiresAt =
      operation === 'logout'
        ? csrfExpiresAt
        : Math.min(csrfExpiresAt, sessionExpiresAt.getTime());
    const token = createSessionCsrfToken(
      this.configService.get<string>('JWT_SECRET'),
      operation,
      clientType,
      sessionId,
      expiresAt,
      now,
    );
    if (!token) {
      throw new ServiceUnavailableException(
        'Session operation is not available',
      );
    }
    return token;
  }

  @Get('private')
  @Auth(ValidRoles.superadmin)
  testingPrivateRoute(@GetUser() user: User) {
    return {
      ok: true,
      message: 'hola mundo',
      user,
    };
  }

  @Get('users')
  @Auth(ValidRoles.superadmin)
  findAll() {
    return this.usersService.findAll();
  }

  @Get('usersRv')
  @Auth(ValidRoles.riffvalley)
  findAllRv() {
    return this.usersService.findAllRv();
  }

  @Get('users/role/:role')
  @Auth(ValidRoles.superadmin)
  findUsersByRole(@Param('role') role: string) {
    return this.usersService.findUsersByRole(role);
  }

  @Get('users/superusers')
  @Auth(ValidRoles.superadmin)
  findSuperUsers() {
    return this.usersService.findSuperUsers();
  }

  @Get('users/admin-stats')
  @Auth(ValidRoles.superadmin)
  findAllAdminStats(@Query() query: ActivityListQueryDto) {
    return this.activityService.findAllAdminStats(query);
  }

  @Get('activity')
  @Auth(ValidRoles.superadmin)
  getAllActivity(@Query() query: ActivityListQueryDto) {
    return this.activityService.getAllActivity(query);
  }

  @Get(':id/activity')
  @Auth(ValidRoles.superadmin)
  getUserActivity(@Param('id') id: string) {
    return this.activityService.getUserActivity(id);
  }

  @Get(':id')
  @Auth(ValidRoles.superadmin)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch('/superadmin/:id')
  @Auth(ValidRoles.superadmin)
  updateSuperAdmin(
    @Param('id') id: string,
    @Body() updateAuthDto: AdminUpdateUserDto,
    @GetUser() user: User,
  ) {
    return this.usersService.updateUserSuperAdmin(id, updateAuthDto, user.id);
  }

  @Patch()
  @Auth()
  update(@Body() updateAuthDto: UpdateUserDto, @GetUser() user: User) {
    return this.usersService.updateUser(updateAuthDto, user.id);
  }

  @Patch(':id/deactivate')
  @Auth(ValidRoles.superadmin)
  deactivate(@Param('id') id: string, @GetUser() user: User) {
    return this.usersService.setActive(id, false, user.id);
  }

  @Patch(':id/activate')
  @Auth(ValidRoles.superadmin)
  activate(@Param('id') id: string, @GetUser() user: User) {
    return this.usersService.setActive(id, true, user.id);
  }

  @Delete(':id')
  @Auth(ValidRoles.superadmin)
  remove(@Param('id') id: string, @GetUser() user: User) {
    return this.usersService.remove(id, user.id);
  }
}

function isEmptyRefreshBody(body: unknown): boolean {
  if (body === undefined) return true;
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0
  );
}
