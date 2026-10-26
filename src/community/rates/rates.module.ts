import { Module } from '@nestjs/common';
import { RatesService } from './rates.service';
import { RatesController } from './rates.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rate } from './entities/rate.entity';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { RatesStatsService } from './stats/rates-stats.service';
import { RatesHistoryService } from './history/rates-history.service';
import { UsersModule } from 'src/identity/users/users.module';
import { RateVoteEvent } from './entities/rate-vote-event.entity';

@Module({
  controllers: [RatesController], // Controladores que gestionan las rutas
  providers: [RatesService, RatesStatsService, RatesHistoryService],
  imports: [
    TypeOrmModule.forFeature([Rate, Disc, RateVoteEvent]),
    AuthorizationModule,
    UsersModule,
  ], // Registro de la entidad Rate en TypeORM
  exports: [RatesStatsService],
})
export class RatesModule {}
