import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ContentSchedulerService } from './editorial/contents/content-scheduler.service';
import { DiscLinkMaintenanceService } from './catalog/discs/maintenance/disc-link-maintenance.service';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './winston.config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  try {
    const command = process.argv[2];

    switch (command) {
      case 'check-spotify':
        await app.get(DiscLinkMaintenanceService).runDailyLinkMaintenance();
        break;
      case 'create-weekly':
        console.log('Running create-weekly...');
        await app.get(ContentSchedulerService).createWeeklyContent();
        break;
      default:
        console.error(
          'Command not found. Available commands: check-spotify, create-weekly',
        );
        process.exit(1);
    }
  } catch (error) {
    const logger = app.get(Logger);
    logger.error('Error executing command', error);
  }

  // Ensure logs are flushed before exit if possible, but app.close() handles graceful shutdown
  await app.close();
  // Winston HTTP transport might need a moment to flush logs before the process dies.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  process.exit(0);
}

bootstrap();
