import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../communications/mail/mail.service';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AccessRequestsService {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateAccessRequestDto): Promise<{ message: string }> {
    // Validar que el alias no exista ya en la base de datos
    if (await this.usersService.isUsernameTaken(dto.alias)) {
      throw new BadRequestException('El alias ya está en uso');
    }

    // Enviar email de notificación
    try {
      await this.mailService.sendAccessRequestNotification(
        dto.email,
        dto.alias,
      );
    } catch (error) {
      this.logger.error('Error al enviar email de solicitud de acceso', error);
    }

    return { message: 'Solicitud de acceso enviada correctamente' };
  }
}
