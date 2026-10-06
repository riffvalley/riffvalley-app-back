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
import { UpdateGenreDto } from './dto/update-genre.dto';
import { PaginationDto } from '../../common/dtos/pagination.dto';

@Controller('genres')
export class GenresController {
  constructor(private readonly unitsService: GenresService) {}

  @Post()
  create(@Body() createGenreDto: CreateGenreDto) {
    return this.unitsService.create(createGenreDto);
  }

  @Post('bultCreateGenre')
  bulkCreate(
    @Body() createGenresArray: { genres: { name: string; color: string }[] },
  ) {
    return this.unitsService.bulkCreate(createGenresArray);
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.unitsService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.unitsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGenreDto: UpdateGenreDto,
  ) {
    return this.unitsService.update(id, updateGenreDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.unitsService.remove(id);
  }
}
