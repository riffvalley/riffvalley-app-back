import { Module } from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { News } from './entities/news.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TelegramIntegrationModule } from 'src/integrations/telegram-integration/telegram-integration.module';
import { WordpressIntegrationModule } from 'src/integrations/wordpress-integration/wordpress-integration.module';

@Module({
  controllers: [NewsController],
  providers: [NewsService],
  imports: [
    TypeOrmModule.forFeature([News]),
    AuthModule,
    TelegramIntegrationModule,
    WordpressIntegrationModule,
  ],
})
export class NewsModule {}
