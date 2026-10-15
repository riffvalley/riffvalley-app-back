import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { GenresService } from './genres.service';
import { CreateGenreDto } from './dto/create-genre.dto';
import { CreateGenresBatchDto } from './dto/create-genres-batch.dto';
import { UpdateGenreDto } from './dto/update-genre.dto';
import { GenresQueryDto } from './dto/genres-query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

@Controller('genres')
export class GenresController {
  constructor(private readonly unitsService: GenresService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createGenreDto: CreateGenreDto) {
    return this.unitsService.create(createGenreDto);
  }

  @Post('bultCreateGenre')
  @Auth(ValidRoles.riffvalley)
  bulkCreate(@Body() createGenresArray: CreateGenresBatchDto) {
    return this.unitsService.bulkCreate(createGenresArray);
  }

  @Get()
  findAll(@Query() paginationDto: GenresQueryDto) {
    return this.unitsService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.unitsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGenreDto: UpdateGenreDto,
  ) {
    return this.unitsService.update(id, updateGenreDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.unitsService.remove(id);
  }
}
