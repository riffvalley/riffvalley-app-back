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
import { CountriesService } from './countries.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CountriesQueryDto } from './dto/countries-query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

@Controller('countries')
export class CountriesController {
  constructor(private readonly unitsService: CountriesService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createGenreDto: CreateCountryDto) {
    return this.unitsService.create(createGenreDto);
  }

  @Get()
  findAll(@Query() countriesQueryDto: CountriesQueryDto) {
    return this.unitsService.findAll(countriesQueryDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.unitsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGenreDto: UpdateCountryDto,
  ) {
    return this.unitsService.update(id, updateGenreDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.unitsService.remove(id);
  }
}
