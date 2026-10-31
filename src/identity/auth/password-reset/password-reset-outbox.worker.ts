import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from 'src/communications/mail/mail.service';
import { PasswordResetService } from './password-reset.service';
import { createPasswordResetLink } from './password-reset-url';

type WorkerSettings = {
  pollMs: number;
  leaseSeconds: number;
  maxAttempts: number;
  baseBackoffSeconds: number;
  maxBackoffSeconds: number;
  retentionDays: number;
};

const DEFAULTS: WorkerSettings = {
  pollMs: 5000,
  leaseSeconds: 60,
  maxAttempts: 5,
  baseBackoffSeconds: 30,
  maxBackoffSeconds: 900,
  retentionDays: 30,
};
const MAINTENANCE_INTERVAL_MS = 60_000;

@Injectable()
export class PasswordResetOutboxWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PasswordResetOutboxWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private lastMaintenanceAt = 0;
  private settings: WorkerSettings = DEFAULTS;

  constructor(
    private readonly configService: ConfigService,
    private readonly passwordResetService: PasswordResetService,
    private readonly mailService: MailService,
  ) {}

  onModuleInit(): void {
    const enabled = this.configService.get<string>(
      'AUTH_PASSWORD_RESET_WORKER_ENABLED',
    );
    if (enabled === 'false') {
      return;
    }
    if (enabled !== undefined && enabled !== '' && enabled !== 'true') {
      throw new Error('Password reset worker configuration is invalid');
    }
    this.settings = this.readSettings();
    this.passwordResetService.assertConfigured();
    createPasswordResetLink(
      this.configService.get<string>('AUTH_PASSWORD_RESET_URL'),
      this.configService.get<string>('STAGE'),
      'A'.repeat(43),
    );
    this.timer = setInterval(
      () => void this.processBatch(),
      this.settings.pollMs,
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processBatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (Date.now() - this.lastMaintenanceAt >= MAINTENANCE_INTERVAL_MS) {
        await this.passwordResetService.cleanupTerminalRequests(
          this.settings.retentionDays,
          500,
        );
        this.lastMaintenanceAt = Date.now();
      }
      await this.passwordResetService.failExhaustedDeliveries(
        this.settings.maxAttempts,
        10,
      );
      const claims = await this.passwordResetService.claimPendingDeliveries(
        10,
        this.settings.leaseSeconds,
        this.settings.maxAttempts,
      );
      for (const claim of claims) await this.deliver(claim);
    } catch {
      this.logger.warn('security_event=password_reset_worker_batch_failed');
    } finally {
      this.running = false;
    }
  }

  private async deliver(claim: {
    requestId: string;
    attemptCount: number;
    lockedUntil: Date;
  }): Promise<void> {
    try {
      const delivery = await this.passwordResetService.getClaimedDelivery(
        claim.requestId,
        claim.lockedUntil,
      );
      if (!delivery) {
        await this.passwordResetService.failPendingDelivery(claim.requestId);
        return;
      }

      const resetUrl = createPasswordResetLink(
        this.configService.get<string>('AUTH_PASSWORD_RESET_URL'),
        this.configService.get<string>('STAGE'),
        delivery.token,
      );
      await this.mailService.sendPasswordReset(delivery.email, resetUrl);
      const activated =
        await this.passwordResetService.activateDeliveredRequest(
          claim.requestId,
        );
      if (!activated) {
        await this.passwordResetService.failPendingDelivery(claim.requestId);
      }
    } catch {
      const delaySeconds = Math.min(
        this.settings.maxBackoffSeconds,
        this.settings.baseBackoffSeconds *
          2 ** Math.max(0, claim.attemptCount - 1),
      );
      await this.passwordResetService.retryPendingDelivery(
        claim.requestId,
        delaySeconds,
        this.settings.maxAttempts,
        claim.lockedUntil,
      );
      this.logger.warn(
        `security_event=password_reset_delivery_attempt_failed request_id=${claim.requestId} attempt=${claim.attemptCount}`,
      );
    }
  }

  private readSettings(): WorkerSettings {
    const settings: WorkerSettings = {
      pollMs: this.readInteger(
        'AUTH_PASSWORD_RESET_WORKER_POLL_MS',
        DEFAULTS.pollMs,
      ),
      leaseSeconds: this.readInteger(
        'AUTH_PASSWORD_RESET_WORKER_LEASE_SECONDS',
        DEFAULTS.leaseSeconds,
      ),
      maxAttempts: this.readInteger(
        'AUTH_PASSWORD_RESET_MAX_ATTEMPTS',
        DEFAULTS.maxAttempts,
      ),
      baseBackoffSeconds: this.readInteger(
        'AUTH_PASSWORD_RESET_BACKOFF_BASE_SECONDS',
        DEFAULTS.baseBackoffSeconds,
      ),
      maxBackoffSeconds: this.readInteger(
        'AUTH_PASSWORD_RESET_BACKOFF_MAX_SECONDS',
        DEFAULTS.maxBackoffSeconds,
      ),
      retentionDays: this.readInteger(
        'AUTH_PASSWORD_RESET_RETENTION_DAYS',
        DEFAULTS.retentionDays,
      ),
    };
    if (
      settings.pollMs < 250 ||
      settings.leaseSeconds < 30 ||
      settings.maxAttempts < 1 ||
      settings.baseBackoffSeconds < 1 ||
      settings.maxBackoffSeconds < settings.baseBackoffSeconds ||
      settings.retentionDays < 1
    ) {
      throw new Error('Password reset worker configuration is invalid');
    }
    return settings;
  }

  private readInteger(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    if (rawValue === undefined || rawValue === '') return fallback;
    if (!/^\d+$/.test(rawValue)) {
      throw new Error('Password reset worker configuration is invalid');
    }
    const value = Number(rawValue);
    if (!Number.isSafeInteger(value)) {
      throw new Error('Password reset worker configuration is invalid');
    }
    return value;
  }
}
