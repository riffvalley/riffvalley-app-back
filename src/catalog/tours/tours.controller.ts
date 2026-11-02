import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../../identity/auth/decorators/auth.decorator';
import { ValidRoles } from '../../identity/auth/interfaces/valid-roles';
import { CreateTourDto } from './dto/create-tour.dto';
import { ToursQueryDto } from './dto/tours-query.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
import { ToursService } from './tours.service';

@Controller('tours')
export class ToursController {
  constructor(private readonly toursService: ToursService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() dto: CreateTourDto) {
    return this.toursService.create(dto);
  }

  @Get()
  findAll(@Query() query: ToursQueryDto) {
    return this.toursService.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ToursQueryDto,
  ) {
    return this.toursService.findOne(id, query);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTourDto) {
    return this.toursService.update(id, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.toursService.remove(id);
  }
}
