import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Point } from './entities/point.entity';
import { Reunion } from '../entities/reunion.entity';
import { PointService } from './points.service';
import { PointController } from './points.controller';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { ReunionsRealtimeModule } from '../realtime/reunions-realtime.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Point, Reunion]),
    AuthorizationModule,
    ReunionsRealtimeModule,
  ],
  controllers: [PointController],
  providers: [PointService],
  exports: [TypeOrmModule],
})
export class PointsModule {}
