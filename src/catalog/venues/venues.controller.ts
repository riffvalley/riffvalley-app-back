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
import { CreateVenueDto } from './dto/create-venue.dto';
import { ImportVenuesBatchDto } from './dto/import-venues-batch.dto';
import { ResolveVenuesBatchDto } from './dto/resolve-venues-batch.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenuesQueryDto } from './dto/venues-query.dto';
import { VenuesService } from './venues.service';

@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() dto: CreateVenueDto) {
    return this.venuesService.create(dto);
  }

  @Post('import-batch')
  @Auth(ValidRoles.riffvalley)
  importBatch(@Body() dto: ImportVenuesBatchDto) {
    return this.venuesService.importBatch(dto);
  }

  @Get()
  findAll(@Query() query: VenuesQueryDto) {
    return this.venuesService.findAll(query);
  }

  @Get('map')
  findMap(@Query() query: VenuesQueryDto) {
    return this.venuesService.findMap(query);
  }

  @Post('resolve-batch')
  resolveBatch(@Body() dto: ResolveVenuesBatchDto) {
    return this.venuesService.resolveBatch(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVenueDto) {
    return this.venuesService.update(id, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.remove(id);
  }
}
