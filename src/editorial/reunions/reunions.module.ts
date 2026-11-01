import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reunion } from './entities/reunion.entity';
import { ReunionService } from './reunions.service';
import { ReunionController } from './reunions.controller';
import { ContentsModule } from 'src/editorial/contents/contents.module';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { ReunionsRealtimeModule } from './realtime/reunions-realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reunion, Content]),
    ContentsModule,
    AuthorizationModule,
    ReunionsRealtimeModule,
  ],
  controllers: [ReunionController],
  providers: [ReunionService],
  exports: [ReunionService, TypeOrmModule], // Exporta el servicio y el repositorio (TypeOrmModule)
})
export class ReunionsModule {}
