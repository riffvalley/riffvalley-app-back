import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LocalizacionesService } from './localizaciones.service';
import { CreateLocalizacionDto } from './dto/create-localizacion.dto';
import { UpdateLocalizacionDto } from './dto/update-localizacion.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@Controller('localizaciones')
export class LocalizacionesController {
  constructor(private readonly localizacionesService: LocalizacionesService) {}

  @Post()
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  create(@Body() dto: CreateLocalizacionDto) {
    return this.localizacionesService.create(dto);
  }

  @Get()
  findAll() {
    return this.localizacionesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.localizacionesService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocalizacionDto,
  ) {
    return this.localizacionesService.update(id, dto);
  }

  @Post(':id/geocode')
  @HttpCode(HttpStatus.OK)
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  geocode(@Param('id', ParseUUIDPipe) id: string) {
    return this.localizacionesService.geocode(id);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.localizacionesService.remove(id);
  }
}
