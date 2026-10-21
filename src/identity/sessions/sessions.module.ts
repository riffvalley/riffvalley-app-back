import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import { AuthSession } from './entities/auth-session.entity';
import {
  SESSIONS_PERSISTENCE,
  TypeOrmSessionsPersistence,
} from './persistence/sessions.persistence';
import { SessionsService } from './sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuthSession, AuthRefreshToken])],
  providers: [
    TypeOrmSessionsPersistence,
    {
      provide: SESSIONS_PERSISTENCE,
      useExisting: TypeOrmSessionsPersistence,
    },
    SessionsService,
  ],
  exports: [SessionsService],
})
export class SessionsModule {}
