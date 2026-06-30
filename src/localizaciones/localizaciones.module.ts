import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Localizacion } from './entities/localizacion.entity';
import { LocalizacionesController } from './localizaciones.controller';
import { LocalizacionesService } from './localizaciones.service';

@Module({
  imports: [TypeOrmModule.forFeature([Localizacion]), HttpModule, AuthModule],
  controllers: [LocalizacionesController],
  providers: [LocalizacionesService],
  exports: [TypeOrmModule],
})
export class LocalizacionesModule {}
