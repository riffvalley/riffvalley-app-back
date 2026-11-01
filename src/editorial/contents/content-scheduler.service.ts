import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/identity/auth/entities/user.entity';
import { ContentsService } from './contents.service';
import { ContentType } from './entities/content.entity';
import { CONTENT_CALENDAR_SYSTEM_ACTOR } from './realtime/contracts/content-calendar-event.contract';

@Injectable()
export class ContentSchedulerService {
  private readonly logger = new Logger(ContentSchedulerService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly contentsService: ContentsService,
  ) {}

  // Ejecuta cada lunes a las 8:00 AM
  @Cron('0 8 * * 1', {
    timeZone: 'Europe/Madrid',
  })
  async createWeeklyContent() {
    this.logger.log('Starting weekly content creation job...');

    const now = new Date();
    // Guard: Only run on Mondays (Day 1)
    // This is important because Heroku Scheduler only runs Daily, so we need to skip other days.
    if (now.getDay() !== 1) {
      this.logger.log('Today is not Monday. Skipping weekly content creation.');
      return;
    }

    const author = await this.userRepo.findOne({
      select: ['id'],
      where: {},
      order: { id: 'ASC' },
    }); // Obtener un usuario por defecto (el primero)

    if (!author) {
      this.logger.error(
        'No user found to assign as author for scheduled content',
      );
      this.logger.log('Weekly content creation job finished with error.');
      return;
    }

    // --- 1. Crear Content REUNION (Next Wednesday) ---
    // Calcular el próximo miércoles
    const currentDay = now.getDay(); // 0 = Domingo, 1 = Lunes, ..., 3 = Miércoles
    const daysUntilWednesday = (3 - currentDay + 7) % 7 || 7;

    const nextWednesday = new Date(now);
    nextWednesday.setDate(now.getDate() + daysUntilWednesday);
    nextWednesday.setHours(20, 0, 0, 0); // 20:00 (8 PM)

    const dayReunion = nextWednesday.getDate();
    const monthReunion = nextWednesday.getMonth() + 1;
    const yearReunion = nextWednesday.getFullYear();

    const titleReunion = `Reunion ${dayReunion}-${monthReunion}-${yearReunion}`;

    this.logger.log(`Creating weekly reunion content: ${titleReunion}`);

    try {
      await this.contentsService.create(
        {
          name: titleReunion,
          type: ContentType.REUNION,
          authorId: author.id,
          publicationDate: nextWednesday.toISOString(),
        },
        { actor: CONTENT_CALENDAR_SYSTEM_ACTOR },
      );
      this.logger.log(`Weekly reunion content created successfully`);
    } catch (error) {
      this.logger.error(
        `Error creating weekly reunion content: ${error.message}`,
        error.stack,
      );
    }

    // El radar semanal se crea desde el calendario, no desde este cron.

    this.logger.log('Weekly content creation job finished.');
  }
}
