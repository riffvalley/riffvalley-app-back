import { Module } from '@nestjs/common';
import { DiscsService } from './discs.service';
import { DiscsController } from './discs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Disc } from './entities/disc.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [DiscsController],
  providers: [DiscsService],
  imports: [TypeOrmModule.forFeature([Disc]), AuthModule],
  exports: [DiscsService],
})
export class DiscModule {}
