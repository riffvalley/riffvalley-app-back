import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EventosService } from './eventos.service';
import { CreateEventoDto } from './dto/create-evento.dto';
import { UpdateEventoDto } from './dto/update-evento.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  @Post()
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  create(@Body() dto: CreateEventoDto) {
    return this.eventosService.create(dto);
  }

  @Get()
  findAll() {
    return this.eventosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventosService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventoDto,
  ) {
    return this.eventosService.update(id, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventosService.remove(id);
  }
}
