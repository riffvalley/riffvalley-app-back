import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { NationalReleasesService } from './national-releases.service';
import { CreateNationalReleaseDto } from './dto/create-national-release.dto';
import { UpdateNationalReleaseDto } from './dto/update-national-release.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@Controller('national-releases')
export class NationalReleasesController {
  constructor(private readonly service: NationalReleasesService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  create(@Body() dto: CreateNationalReleaseDto | CreateNationalReleaseDto[]) {
    return Array.isArray(dto) ? this.service.createMany(dto) : this.service.create(dto);
  }

  @Get()
  findAll(@Query('month') month?: string, @Query('year') year?: string) {
    return this.service.findAll(
      month ? parseInt(month, 10) : undefined,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @Get('all')
  @Auth(ValidRoles.riffValley, ValidRoles.admin)
  findAllAdmin(@Query('month') month?: string, @Query('year') year?: string) {
    return this.service.findAllAdmin(
      month ? parseInt(month, 10) : undefined,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffValley)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNationalReleaseDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
