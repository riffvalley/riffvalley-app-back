import { Module } from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { News } from './entities/news.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TelegramModule } from 'src/telegram/telegram.module';

@Module({
  controllers: [NewsController],
  providers: [NewsService],
  imports: [TypeOrmModule.forFeature([News]), AuthModule, TelegramModule],
})
export class NewsModule {}
