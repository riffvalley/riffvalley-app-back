import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  Headers,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import {
  AUTH_SESSION_MODE,
  AUTH_SESSION_MODE_HEADER,
} from './dto/session-auth-contract.dto';
import { GetUser } from './decorators/get-user.decorator';
import { User } from './entities/user.entity';
import { ValidRoles } from './interfaces/valid-roles';
import { Auth } from './decorators/auth.decorator';
import { AdminUpdateUserDto, UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';
import { UsersService } from '../users/users.service';
import { ActivityService } from '../activity/activity.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly activityService: ActivityService,
  ) {}

  @Post('register')
  create(@Body() createUserDto: CreateUserDto) {
    return this.authService.create(createUserDto);
  }

  @Post('login')
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Headers(AUTH_SESSION_MODE_HEADER) sessionMode?: string,
    @Headers('origin') origin?: string,
  ) {
    if (sessionMode !== undefined) {
      this.authService.resolveSessionLoginClient({
        mode: sessionMode,
        origin,
      });

      // Do not create a session until this route can deliver refresh only via
      // a protected HttpOnly cookie. The legacy request remains unaffected.
      throw new ServiceUnavailableException(
        `Session login transport is not available for ${AUTH_SESSION_MODE}`,
      );
    }

    const response = await this.authService.login(loginUserDto);
    await this.activityService.recordLoginAccess(response.id);
    return response;
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
  findAllAdminStats(@Query() paginationDto: PaginationDto) {
    return this.activityService.findAllAdminStats(paginationDto);
  }

  @Get('activity')
  @Auth(ValidRoles.superadmin)
  getAllActivity(@Query() paginationDto: PaginationDto) {
    return this.activityService.getAllActivity(paginationDto);
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
