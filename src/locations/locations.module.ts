import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Location } from './entities/location.entity';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Location]), HttpModule, AuthModule],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [TypeOrmModule],
})
export class LocationsModule {}
