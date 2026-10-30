import {
  ForbiddenException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveSessionClientFromOrigin } from './session-http/session-http-security';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { AUTH_SESSION_MODE } from './dto/session-auth-contract.dto';
import { User } from './entities/user.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { SessionClientType } from '../sessions/entities/auth-session.entity';
import { SessionCredential } from '../sessions/sessions.service';
import {
  InvalidSessionCredentialError,
  RefreshOperationAlreadyProcessedError,
  RefreshTokenReuseDetectedError,
} from '../sessions/errors/sessions.errors';

let dummyPasswordHash: string | undefined;

export type SessionLoginContext = {
  mode: string | undefined;
  origin: string | undefined;
};

export type SessionLoginResult = {
  user: Omit<
    User,
    'password' | 'checkFieldsBeforeInsert' | 'checkFieldsBeforeUpdate'
  >;
  accessToken: string;
  refreshCredential: SessionCredential;
};

export type SessionRefreshResult = {
  user: SessionLoginResult['user'];
  accessToken: string;
  refreshCredential: SessionCredential;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly sessionsService: SessionsService,
    private readonly configService: ConfigService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const user = await this.usersService.createAccount(createUserDto);
    return {
      ...user,
      token: this.getJwtToken({
        username: user.username,
        id: user.id,
        role: user.role,
      }),
    };
  }

  /**
   * Composes an authenticated renewable login after the HTTP controller has
   * validated edge transport, Origin, content type, Fetch Metadata and CSRF.
   */
  async loginWithSession(
    loginUserDto: LoginUserDto,
    context: SessionLoginContext,
  ): Promise<SessionLoginResult> {
    if (
      this.configService.get<string>('AUTH_SESSION_MODE_ENABLED') !== 'true'
    ) {
      throw new ServiceUnavailableException('Session login is not available');
    }

    const clientType = this.resolveSessionClient(context);
    if (!clientType) {
      throw new UnauthorizedException('Credentials are not valid!');
    }

    const user = await this.authenticateActiveUser(loginUserDto);
    const refreshCredential = await this.sessionsService.createSession({
      userId: user.id,
      clientType,
    });

    try {
      await this.usersService.recordLogin(user.id);
      return {
        user: this.withoutPassword(user),
        accessToken: this.getSessionJwtToken({
          username: user.username,
          id: user.id,
          role: user.role,
          clientType: refreshCredential.clientType,
        }),
        refreshCredential,
      };
    } catch (error) {
      await this.sessionsService.revokeSession({
        sessionId: refreshCredential.sessionId,
        userId: user.id,
        clientType,
      });
      throw error;
    }
  }

  async refreshWithSession(
    refreshToken: string,
    operationId: string,
    context: SessionLoginContext,
  ): Promise<SessionRefreshResult> {
    const clientType = this.resolveSessionLoginClient(context);

    let refreshCredential: SessionCredential;
    try {
      refreshCredential = await this.sessionsService.rotateRefreshToken({
        refreshToken,
        operationId,
        clientType,
      });
    } catch (error) {
      if (error instanceof RefreshOperationAlreadyProcessedError) {
        throw new ConflictException('Refresh operation is not available');
      }
      if (
        error instanceof InvalidSessionCredentialError ||
        error instanceof RefreshTokenReuseDetectedError
      ) {
        throw new UnauthorizedException('Session is not available');
      }
      throw error;
    }

    const user = await this.usersService.findSessionProfileById(
      refreshCredential.userId,
    );
    if (!user?.isActive) {
      throw new UnauthorizedException('Session is not available');
    }

    return {
      user: this.withoutPassword(user),
      accessToken: this.getSessionJwtToken({
        username: user.username,
        id: user.id,
        role: user.role,
        clientType: refreshCredential.clientType,
      }),
      refreshCredential,
    };
  }

  /**
   * Resolves the negotiated client from the exact configured Origin. The
   * controller remains responsible for cookie and request security controls.
   */
  resolveSessionLoginClient(context: SessionLoginContext): SessionClientType {
    if (
      this.configService.get<string>('AUTH_SESSION_MODE_ENABLED') !== 'true' ||
      context.mode !== AUTH_SESSION_MODE
    ) {
      throw new ServiceUnavailableException('Session login is not available');
    }

    const clientType = this.resolveSessionClient(context);
    if (!clientType) {
      throw new ForbiddenException('Origin is not allowed');
    }

    return clientType;
  }

  private async authenticateActiveUser(
    loginUserDto: LoginUserDto,
  ): Promise<User> {
    const user = await this.usersService.findCredentialsByUsername(
      loginUserDto.username,
    );
    if (!this.passwordMatchesUser(loginUserDto.password, user)) {
      throw new UnauthorizedException('Credentials are not valid!');
    }

    const identity = await this.usersService.findIdentityById(user.id);
    if (!identity?.isActive) {
      throw new UnauthorizedException('Credentials are not valid!');
    }
    return user;
  }

  private passwordMatchesUser(password: string, user: User | null): boolean {
    if (user) return bcrypt.compareSync(password, user.password);

    dummyPasswordHash ??= bcrypt.hashSync(
      randomBytes(32).toString('base64url'),
      10,
    );
    bcrypt.compareSync(password, dummyPasswordHash);
    return false;
  }

  private resolveSessionClient(
    context: SessionLoginContext,
  ): SessionClientType | null {
    if (context.mode !== 'refresh-v1') return null;

    return resolveSessionClientFromOrigin(context.origin, {
      app: this.configService.get<string>('AUTH_SESSION_APP_ORIGIN'),
      betaApp: this.configService.get<string>('AUTH_SESSION_BETA_APP_ORIGIN'),
      wiki: this.configService.get<string>('AUTH_SESSION_WIKI_ORIGIN'),
    });
  }

  private withoutPassword(user: User): SessionLoginResult['user'] {
    const safeUser = { ...user };
    Reflect.deleteProperty(safeUser, 'password');
    return safeUser;
  }

  private getSessionJwtToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  private getJwtToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
