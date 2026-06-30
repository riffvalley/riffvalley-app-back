import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Localizacion } from './entities/localizacion.entity';
import { LocalizacionesController } from './localizaciones.controller';
import { LocalizacionesService } from './localizaciones.service';

@Module({
  imports: [TypeOrmModule.forFeature([Localizacion]), AuthModule],
  controllers: [LocalizacionesController],
  providers: [LocalizacionesService],
  exports: [TypeOrmModule],
})
export class LocalizacionesModule {}
