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

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService],
  imports: [
    ConfigModule,
    UsersModule,
    ActivityModule,
    AuthorizationModule,
    SessionsModule,
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
