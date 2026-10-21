import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';

@Module({
  imports: [AuthorizationModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramIntegrationModule {}
