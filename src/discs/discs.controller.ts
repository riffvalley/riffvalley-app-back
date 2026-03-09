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
import { DiscsService } from './discs.service';
import { CreateDiscDto } from './dto/create-discs.dto';
import { UpdateDiscDto } from './dto/update-discs.dto';
import { PaginationDto } from '../common/dtos/pagination.dto';

import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/auth/entities/user.entity';
import { TopStatsQueryDto } from 'src/common/dtos/top-stats-query.dto';
import { WeeklyQueryDto } from './dto/weekly-query.dto';

@Controller('discs')
export class DiscsController {
  constructor(private readonly discsServices: DiscsService) {}

  @Post()
  create(@Body() createDiscDto: CreateDiscDto) {
    return this.discsServices.create(createDiscDto);
  }

  @Get('weekly')
  findWeekly(@Query() dto: WeeklyQueryDto) {
    return this.discsServices.findWeekly(dto.month, dto.year, dto.week);
  }

  @Get('date')
  @Auth()
  findAllByDate(@Query() paginationDto: PaginationDto, @GetUser() user: User) {
    return this.discsServices.findAllByDate(paginationDto, user);
  }

  @Auth()
  @Get('homeDiscs')
  findTopRatedOrFeatured(
    @Query() dto: TopStatsQueryDto,
    @GetUser() user: User,
  ) {
    return this.discsServices.findTopRatedOrFeaturedAndStats(
      dto,
      user,
      dto.genreId,
    );
  }

  @Get()
  @Auth()
  findAll(@Query() paginationDto: PaginationDto, @GetUser() user: User) {
    return this.discsServices.findAll(paginationDto, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.discsServices.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDiscDto: UpdateDiscDto,
  ) {
    return this.discsServices.update(id, updateDiscDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.discsServices.remove(id);
  }
}
