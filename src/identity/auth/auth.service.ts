import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { User } from './entities/user.entity';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { SessionClientType } from '../sessions/entities/auth-session.entity';
import { SessionCredential } from '../sessions/sessions.service';

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

  async login(loginUserDto: LoginUserDto) {
    const { password, username } = loginUserDto;
    const user = await this.usersService.findCredentialsByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      throw new UnauthorizedException('Credentials are not valid!');
    }

    await this.usersService.recordLogin(user.id);

    const safeUser = { ...user };
    Reflect.deleteProperty(safeUser, 'password');
    return {
      ...safeUser,
      token: this.getJwtToken({
        username: user.username,
        id: user.id,
        role: user.role,
      }),
    };
  }

  /**
   * Internal composition for the future negotiated HTTP flow. No controller
   * calls this method until the cookie, CSRF, CORS and capacity gates are met.
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

  private async authenticateActiveUser(
    loginUserDto: LoginUserDto,
  ): Promise<User> {
    const user = await this.usersService.findCredentialsByUsername(
      loginUserDto.username,
    );
    if (!user || !bcrypt.compareSync(loginUserDto.password, user.password)) {
      throw new UnauthorizedException('Credentials are not valid!');
    }

    const identity = await this.usersService.findIdentityById(user.id);
    if (!identity?.isActive) {
      throw new UnauthorizedException('Credentials are not valid!');
    }
    return user;
  }

  private resolveSessionClient(
    context: SessionLoginContext,
  ): SessionClientType | null {
    if (
      context.mode !== 'refresh-v1' ||
      !this.isCanonicalOrigin(context.origin)
    ) {
      return null;
    }

    const appOrigin = this.configService.get<string>('AUTH_SESSION_APP_ORIGIN');
    const wikiOrigin = this.configService.get<string>(
      'AUTH_SESSION_WIKI_ORIGIN',
    );
    if (!appOrigin || !wikiOrigin || appOrigin === wikiOrigin) return null;
    if (context.origin === appOrigin) return 'app';
    if (context.origin === wikiOrigin) return 'wiki';
    return null;
  }

  private isCanonicalOrigin(origin: string | undefined): origin is string {
    if (!origin) return false;
    try {
      const parsedOrigin = new URL(origin);
      return (
        parsedOrigin.protocol === 'https:' && parsedOrigin.origin === origin
      );
    } catch {
      return false;
    }
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
