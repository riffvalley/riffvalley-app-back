import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reunion } from './entities/reunion.entity';
import { ReunionService } from './reunions.service';
import { ReunionController } from './reunions.controller';

import { ContentsModule } from 'src/contents/contents.module';
import { Content } from 'src/contents/entities/content.entity';
import { forwardRef } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reunion, Content]),
    forwardRef(() => ContentsModule),
    AuthModule,
  ],
  controllers: [ReunionController],
  providers: [ReunionService],
  exports: [ReunionService, TypeOrmModule], // Exporta el servicio y el repositorio (TypeOrmModule)
})
export class ReunionsModule {}
