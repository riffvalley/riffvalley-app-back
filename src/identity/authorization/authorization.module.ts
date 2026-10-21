import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { UserRoleGuard } from './guards/user-role/user-role.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    UsersModule,
  ],
  providers: [JwtStrategy, UserRoleGuard],
  exports: [JwtStrategy, UserRoleGuard, PassportModule, UsersModule],
})
export class AuthorizationModule {}
