import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { Article } from './entities/article.entity';
import { ContentsModule } from 'src/editorial/contents/contents.module';
import { AuthModule } from 'src/identity/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article]),
    forwardRef(() => ContentsModule),
    AuthModule,
  ],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService, TypeOrmModule],
})
export class ArticlesModule {}
