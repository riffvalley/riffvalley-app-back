import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reunion } from './entities/reunion.entity';
import { ReunionService } from './reunions.service';
import { ReunionController } from './reunions.controller';
import { ContentsModule } from 'src/editorial/contents/contents.module';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reunion, Content]),
    ContentsModule,
    AuthorizationModule,
  ],
  controllers: [ReunionController],
  providers: [ReunionService],
  exports: [ReunionService, TypeOrmModule], // Exporta el servicio y el repositorio (TypeOrmModule)
})
export class ReunionsModule {}
