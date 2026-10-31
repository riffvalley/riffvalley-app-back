import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { ActivityModule } from '../activity/activity.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AuthRateLimitService } from './rate-limiting/auth-rate-limit.service';
import { PasswordResetService } from './password-reset/password-reset.service';
import { MailModule } from 'src/communications/mail/mail.module';
import { PasswordResetOutboxWorker } from './password-reset/password-reset-outbox.worker';
import { PasswordResetIpRateLimitGuard } from './rate-limiting/password-reset-ip-rate-limit.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRateLimitService,
    PasswordResetService,
    PasswordResetOutboxWorker,
    PasswordResetIpRateLimitGuard,
  ],
  imports: [
    ConfigModule,
    UsersModule,
    ActivityModule,
    AuthorizationModule,
    SessionsModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.get('JWT_SECRET'),
          signOptions: {
            expiresIn: '8h',
          },
        };
      },
    }),
  ],
})
export class AuthModule {}
