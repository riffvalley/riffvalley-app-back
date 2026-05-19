import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';

@Injectable()
export class AccessRequestsService {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateAccessRequestDto): Promise<{ message: string }> {
    // Validar que el alias no exista ya en la base de datos
    const existingUser = await this.userRepository.findOne({
      where: { username: dto.alias },
    });

    if (existingUser) {
      throw new BadRequestException('El alias ya está en uso');
    }

    // Enviar email de notificación
    try {
      await this.mailService.sendAccessRequestNotification(dto.email, dto.alias);
    } catch (error) {
      this.logger.error('Error al enviar email de solicitud de acceso', error);
    }

    return { message: 'Solicitud de acceso enviada correctamente' };
  }
}
