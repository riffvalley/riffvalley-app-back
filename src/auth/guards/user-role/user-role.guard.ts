import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { User } from 'src/auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const validRoles = this.reflector.getAllAndOverride<string[]>(
      META_ROLES,
      [context.getHandler(), context.getClass()],
    );

    if (!validRoles) return true;
    if (validRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as User | undefined;
    if (!user?.id) throw new BadRequestException('User not found');

    const userRep = await this.userRepository.findOne({
      where: { id: user.id },
      select: ['roles'], // Ajusta los campos que deseas incluir
    });

    if (!userRep) throw new BadRequestException('User not found');
    const roles = userRep.roles ?? [];
    for (const role of roles) {
      if (validRoles.includes(role)) {
        return true;
      }
    }

    throw new ForbiddenException(`User ${user.username} is not authorized`);
  }
}
