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
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

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
