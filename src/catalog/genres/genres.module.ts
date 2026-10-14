import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenresService } from './genres.service';
import { GenresController } from './genres.controller';
import { Genre } from './entities/genre.entity';
import { AuthModule } from '../../identity/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Genre]), AuthModule],
  controllers: [GenresController],
  providers: [GenresService],
})
export class GenresModule {}
