import { Module } from '@nestjs/common';
import { ListsService } from './list.service';
import { ListsController } from './list.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { List } from './entities/list.entity';
import { AuthModule } from 'src/auth/auth.module';
import { Content } from 'src/contents/entities/content.entity';

@Module({
  controllers: [ListsController],
  providers: [ListsService],
  imports: [TypeOrmModule.forFeature([List, Content]), AuthModule],
  exports: [ListsService],
})
export class ListsModule {}
