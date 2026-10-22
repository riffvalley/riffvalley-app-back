import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { RatesService } from './rates.service';
import { RatesStatsService } from './stats/rates-stats.service';
import { RatesHistoryService } from './history/rates-history.service';
import { CreateRateDto } from './dto/create-rates.dto';
import { UpdateRateDto } from './dto/update-rates.dto';
import { RatesHistoryQueryDto } from './dto/rates-history-query.dto';
import { CommunityListQueryDto } from '../common/dto/community-list-query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { GetUser } from 'src/identity/auth/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';

@Controller('rates')
export class RatesController {
  constructor(
    private readonly ratesService: RatesService,
    private readonly ratesStatsService: RatesStatsService,
    private readonly ratesHistoryService: RatesHistoryService,
  ) {}

  // ==========================================
  // 1. RUTAS ESTÁTICAS Y ESPECÍFICAS (Arriba)
  // ==========================================

  @Get('stats')
  @Auth()
  getUserStats(@GetUser() user: User, @Query('year') year?: string) {
    return this.ratesStatsService.getUserStats(user, year);
  }

  @Get('home-insights')
  @Auth()
  getHomeInsights(@GetUser() user: User) {
    return this.ratesStatsService.getHomeInsights(user);
  }

  // Esta estaba abajo y fallaba porque chocaba con :id
  @Get('user/:userId/history')
  getUserHistoryQB(
    @Param('userId') userId: string,
    @Query() query: RatesHistoryQueryDto,
  ) {
    if (Boolean(query.from) !== Boolean(query.to)) {
      throw new BadRequestException('from and to must be provided together');
    }

    const dateRange =
      query.from && query.to
        ? ([new Date(query.from), new Date(query.to)] as [Date, Date])
        : undefined;

    return this.ratesHistoryService.findUserActionHistoryPaginatedQB(userId, {
      type: query.type,
      order: query.order,
      limit: Number(query.limit),
      offset: Number(query.offset),
      dateRange,
    });
  }

  // Esta también estaba abajo y fallaba
  @Get('disc/:discId')
  async findRatesByDisc(@Param('discId') discId: string) {
    return this.ratesService.findRatesByDisc(discId);
  }

  // ==========================================
  // 2. RUTAS RAÍZ (El listado general)
  // ==========================================

  @Post()
  @Auth()
  create(@Body() createRateDto: CreateRateDto, @GetUser() user: User) {
    return this.ratesService.create(createRateDto, user);
  }

  @Get() // Este es el GET /rates
  @Auth()
  findAll(@Query() query: CommunityListQueryDto, @GetUser() user: User) {
    return this.ratesService.findAllByUser(query, user);
  }

  // ==========================================
  // 3. RUTAS GENÉRICAS CON :id (Al final)
  // ==========================================

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.ratesService.findOne(id, user);
  }

  @Patch(':id')
  @Auth()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateRateDto: UpdateRateDto,
    @GetUser() user: User,
  ) {
    return this.ratesService.update(id, updateRateDto, user);
  }

  @Delete(':id')
  @Auth()
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.ratesService.remove(id, user);
  }
}
