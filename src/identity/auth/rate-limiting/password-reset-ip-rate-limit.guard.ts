import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  AUTH_RATE_LIMIT_POLICY,
  AuthRateLimitDimension,
} from './auth-rate-limit-policy';
import {
  resolveAuthRateLimitClientAddress,
  SESSION_EDGE_SECRET_CONFIG_KEY,
} from '../session-http/session-http-security';

export const PASSWORD_RESET_IP_RATE_LIMIT_SCOPE =
  'password-reset-ip-rate-limit-scope';

type PasswordResetIpRateLimitScope =
  | 'password_reset_request_ip'
  | 'password_reset_attempt_ip';

@Injectable()
export class PasswordResetIpRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.get<PasswordResetIpRateLimitScope>(
      PASSWORD_RESET_IP_RATE_LIMIT_SCOPE,
      context.getHandler(),
    );
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    const request = context.switchToHttp().getRequest<Request>();
    const address = resolveAuthRateLimitClientAddress(
      request,
      this.configService.get<string>(SESSION_EDGE_SECRET_CONFIG_KEY),
    );
    if (!address || !scope) throw this.unavailable();

    const policy =
      scope === 'password_reset_request_ip'
        ? AUTH_RATE_LIMIT_POLICY.passwordResetRequestIp
        : AUTH_RATE_LIMIT_POLICY.passwordResetAttemptIp;
    const dimension: AuthRateLimitDimension = {
      scope,
      subject: address,
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
    };

    let retryAfter: number | null;
    try {
      retryAfter = await this.authRateLimitService.consume([dimension]);
    } catch {
      throw this.unavailable();
    }
    if (retryAfter === null) return true;

    response.setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      'Authentication request is not available',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Authentication controls are unavailable',
    );
  }
}
