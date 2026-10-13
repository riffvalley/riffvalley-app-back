import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { META_MINIMUM_ROLE } from 'src/auth/decorators/role-protected.decorator';
import { User } from 'src/auth/entities/user.entity';
import {
  isValidRole,
  roleMeetsMinimum,
  ValidRoles,
} from 'src/auth/interfaces/valid-roles';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minimumRole = this.reflector.getAllAndOverride<unknown>(
      META_MINIMUM_ROLE,
      [context.getHandler(), context.getClass()],
    );

    if (minimumRole === undefined) return true;
    if (!isValidRole(minimumRole)) {
      throw new ForbiddenException('Invalid minimum role');
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user as User | undefined;
    if (!user?.id) throw new BadRequestException('User not found');

    const userRep = await this.userRepository.findOne({
      where: { id: user.id },
      select: ['role'],
    });

    if (!userRep) throw new BadRequestException('User not found');
    if (roleMeetsMinimum(userRep.role, minimumRole)) return true;

    throw new ForbiddenException(`User ${user.username} is not authorized`);
  }
}
