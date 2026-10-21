import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenresService } from './genres.service';
import { GenresController } from './genres.controller';
import { Genre } from './entities/genre.entity';
import { AuthorizationModule } from '../../identity/authorization/authorization.module';

@Module({
  imports: [TypeOrmModule.forFeature([Genre]), AuthorizationModule],
  controllers: [GenresController],
  providers: [GenresService],
})
export class GenresModule {}
