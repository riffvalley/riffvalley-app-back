import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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

  private getJwtToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
