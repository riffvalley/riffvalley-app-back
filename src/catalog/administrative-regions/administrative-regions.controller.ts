import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../../identity/auth/decorators/auth.decorator';
import { ValidRoles } from '../../identity/auth/interfaces/valid-roles';
import { AdministrativeRegionsService } from './administrative-regions.service';
import { CreateAdministrativeRegionDto } from './dto/create-administrative-region.dto';
import { AdministrativeRegionsQueryDto } from './dto/administrative-regions-query.dto';
import { UpdateAdministrativeRegionDto } from './dto/update-administrative-region.dto';

@Controller('administrative-regions')
export class AdministrativeRegionsController {
  constructor(
    private readonly administrativeRegionsService: AdministrativeRegionsService,
  ) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() dto: CreateAdministrativeRegionDto) {
    return this.administrativeRegionsService.create(dto);
  }

  @Get()
  findAll(@Query() query: AdministrativeRegionsQueryDto) {
    return this.administrativeRegionsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.administrativeRegionsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdministrativeRegionDto,
  ) {
    return this.administrativeRegionsService.update(id, dto);
  }
}
