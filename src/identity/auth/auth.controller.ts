import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { GetUser } from './decorators/get-user.decorator';
import { User } from './entities/user.entity';
import { ValidRoles } from './interfaces/valid-roles';
import { Auth } from './decorators/auth.decorator';
import { AdminUpdateUserDto, UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  create(@Body() createUserDto: CreateUserDto) {
    return this.authService.create(createUserDto);
  }

  @Post('login')
  login(@Body() LoginUserDto: LoginUserDto) {
    return this.authService.login(LoginUserDto);
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
    return this.authService.findAll();
  }

  @Get('usersRv')
  @Auth(ValidRoles.riffvalley)
  findAllRv() {
    return this.authService.findAllRv();
  }

  @Get('users/role/:role')
  @Auth(ValidRoles.superadmin)
  findUsersByRole(@Param('role') role: string) {
    return this.authService.findUsersByRole(role);
  }

  @Get('users/superusers')
  @Auth(ValidRoles.superadmin)
  findSuperUsers() {
    return this.authService.findSuperUsers();
  }

  @Get('users/admin-stats')
  @Auth(ValidRoles.superadmin)
  findAllAdminStats(@Query() paginationDto: PaginationDto) {
    return this.authService.findAllAdminStats(paginationDto);
  }

  @Get('activity')
  @Auth(ValidRoles.superadmin)
  getAllActivity(@Query() paginationDto: PaginationDto) {
    return this.authService.getAllActivity(paginationDto);
  }

  @Get(':id/activity')
  @Auth(ValidRoles.superadmin)
  getUserActivity(@Param('id') id: string) {
    return this.authService.getUserActivity(id);
  }

  @Get(':id')
  @Auth(ValidRoles.superadmin)
  findOne(@Param('id') id: string) {
    return this.authService.findOne(id);
  }

  @Patch('/superadmin/:id')
  @Auth(ValidRoles.superadmin)
  updateSuperAdmin(
    @Param('id') id: string,
    @Body() updateAuthDto: AdminUpdateUserDto,
    @GetUser() user: User,
  ) {
    return this.authService.updateUserSuperAdmin(id, updateAuthDto, user);
  }

  @Patch()
  @Auth()
  update(@Body() updateAuthDto: UpdateUserDto, @GetUser() user: User) {
    return this.authService.updateUser(updateAuthDto, user);
  }

  @Patch(':id/deactivate')
  @Auth(ValidRoles.superadmin)
  deactivate(@Param('id') id: string, @GetUser() user: User) {
    return this.authService.setActive(id, false, user);
  }

  @Patch(':id/activate')
  @Auth(ValidRoles.superadmin)
  activate(@Param('id') id: string, @GetUser() user: User) {
    return this.authService.setActive(id, true, user);
  }

  @Delete(':id')
  @Auth(ValidRoles.superadmin)
  remove(@Param('id') id: string, @GetUser() user: User) {
    return this.authService.remove(id, user);
  }
}
