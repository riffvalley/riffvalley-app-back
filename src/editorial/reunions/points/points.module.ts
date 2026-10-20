import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Point } from './entities/point.entity';
import { Reunion } from '../entities/reunion.entity';
import { PointService } from './points.service';
import { PointController } from './points.controller';
import { AuthModule } from 'src/identity/auth/auth.module';
@Module({
  imports: [TypeOrmModule.forFeature([Point, Reunion]), AuthModule],
  controllers: [PointController],
  providers: [PointService],
  exports: [TypeOrmModule],
})
export class PointsModule {}
