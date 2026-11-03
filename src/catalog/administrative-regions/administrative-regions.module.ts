import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';
import { Country } from '../countries/entities/country.entity';
import { AdministrativeRegionsController } from './administrative-regions.controller';
import { AdministrativeRegionsService } from './administrative-regions.service';
import { AdministrativeRegion } from './entities/administrative-region.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdministrativeRegion, Country]),
    AuthorizationModule,
  ],
  controllers: [AdministrativeRegionsController],
  providers: [AdministrativeRegionsService],
  exports: [AdministrativeRegionsService],
})
export class AdministrativeRegionsModule {}
