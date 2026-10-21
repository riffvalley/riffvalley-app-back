import { Module } from '@nestjs/common';
import { MailModule } from '../../communications/mail/mail.module';
import { AccessRequestsController } from './access-requests.controller';
import { AccessRequestsService } from './access-requests.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, MailModule],
  controllers: [AccessRequestsController],
  providers: [AccessRequestsService],
})
export class AccessRequestsModule {}
