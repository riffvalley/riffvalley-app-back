import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
  ForbiddenException,
  ParseUUIDPipe,
  Query,
  Optional,
} from '@nestjs/common';
import { RatesService } from './rates.service';
import { RatesStatsService } from './stats/rates-stats.service';
import { RatesHistoryService } from './history/rates-history.service';
import { RatesDashboardSummaryService } from './stats/rates-dashboard-summary.service';
import { CreateRateDto } from './dto/create-rates.dto';
import { UpdateRateDto } from './dto/update-rates.dto';
import { RatesHistoryQueryDto } from './dto/rates-history-query.dto';
import { RatesArtistSummaryQueryDto } from './dto/rates-artist-summary-query.dto';
import { RatesArtistsTopQueryDto } from './dto/rates-artists-top-query.dto';
import { RatesStatsQueryDto } from './dto/rates-stats-query.dto';
import { RatesAnnualStatisticsService } from './stats/rates-annual-statistics.service';
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
    private readonly ratesDashboardSummaryService: RatesDashboardSummaryService,
    @Optional()
    private readonly annualStatisticsService?: Pick<
      RatesAnnualStatisticsService,
      'getUserStats' | 'getRatedDiscs'
    >,
  ) {}

  // ==========================================
  // 1. RUTAS ESTÁTICAS Y ESPECÍFICAS (Arriba)
  // ==========================================

  @Get('stats')
  @Auth()
  getUserStats(@GetUser() user: User, @Query() query: RatesStatsQueryDto) {
    if (!this.annualStatisticsService) {
      throw new Error('Annual statistics service is not configured.');
    }
    return this.annualStatisticsService.getUserStats(
      user.id,
      Number(query.year),
      typeof query.timeZone === 'string' ? query.timeZone : 'UTC',
    );
  }

  @Get('stats/discs')
  @Auth()
  getUserRatedDiscs(@GetUser() user: User, @Query() query: RatesStatsQueryDto) {
    if (!this.annualStatisticsService) {
      throw new Error('Annual statistics service is not configured.');
    }
    return this.annualStatisticsService.getRatedDiscs(
      user.id,
      Number(query.year),
      typeof query.timeZone === 'string' ? query.timeZone : 'UTC',
    );
  }

  @Get('home-insights')
  @Auth()
  getHomeInsights(@GetUser() user: User) {
    return this.ratesStatsService.getHomeInsights(user);
  }

  @Get('artists/top')
  @Auth()
  getTopArtists(
    @GetUser() user: User,
    @Query() query: RatesArtistsTopQueryDto = new RatesArtistsTopQueryDto(),
  ) {
    return this.ratesStatsService.getTopArtists(user.id, query.period);
  }

  @Get('artists/:artistId/summary')
  @Auth()
  getArtistSummary(
    @Param('artistId', ParseUUIDPipe) artistId: string,
    @Query() query: RatesArtistSummaryQueryDto,
    @GetUser() user: User,
  ) {
    return this.ratesStatsService.getArtistSummary(user.id, artistId, query);
  }

  @Get('geography/top')
  @Auth()
  getGeographyTop(@GetUser() user: User) {
    return this.ratesStatsService.getGeographyTop(user);
  }

  @Get('geography/world')
  @Auth()
  getGeographyWorld(@GetUser() user: User) {
    return this.ratesStatsService.getGeographyWorld(user);
  }

  @Get('dashboard-summary')
  @Auth()
  getDashboardSummary(@GetUser() user: User) {
    return this.ratesDashboardSummaryService.getSummary(user.id);
  }

  // Esta estaba abajo y fallaba porque chocaba con :id
  @Get('user/:userId/history')
  @Auth()
  getUserHistoryQB(
    @GetUser() user: User,
    @Param('userId') userId: string,
    @Query() query: RatesHistoryQueryDto,
  ) {
    if (userId !== user.id) {
      throw new ForbiddenException('You can only view your own rate history.');
    }
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
