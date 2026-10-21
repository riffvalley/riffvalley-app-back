import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountriesController } from './countries.controller';
import { Country } from './entities/country.entity';
import { CountriesService } from './countries.service';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([Country]), AuthorizationModule],
  controllers: [CountriesController],
  providers: [CountriesService],
})
export class CountriesModule {}
