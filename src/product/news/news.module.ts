import { Module } from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { News } from './entities/news.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { TelegramIntegrationModule } from 'src/integrations/telegram-integration/telegram-integration.module';
import { WordpressIntegrationModule } from 'src/integrations/wordpress-integration/wordpress-integration.module';

@Module({
  controllers: [NewsController],
  providers: [NewsService],
  imports: [
    TypeOrmModule.forFeature([News]),
    AuthorizationModule,
    TelegramIntegrationModule,
    WordpressIntegrationModule,
  ],
  exports: [NewsService],
})
export class NewsModule {}
