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
  Headers,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ListsService } from './list.service';
import { CreateListDto } from './dto/create-list.dto';
import { CreateWeeklyListDto } from './dto/create-weekly-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { GenerateWpPostsQueryDto } from './dto/generate-wp-posts-query.dto';
import {
  ListYearMonthParamsDto,
  ListYearParamsDto,
} from './dto/list-period-params.dto';
import { ListQueryDto } from './dto/list-query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { GetUser } from 'src/identity/authorization/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { contentCalendarMutationContext } from 'src/editorial/contents/realtime/contracts/content-calendar-event.contract';
import { ListsStreamService } from './realtime/lists-stream.service';

@Controller('lists')
export class ListsController {
  constructor(
    private readonly listsServices: ListsService,
    private readonly listsStreamService: ListsStreamService,
  ) {}

  @Get('events')
  @Auth(ValidRoles.riffvalley)
  openEvents(@Req() request: Request, @Res() response: Response): void {
    this.listsStreamService.open(request, response);
  }

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createListDto: CreateListDto) {
    return this.listsServices.create(createListDto);
  }

  @Get()
  @Auth()
  findAll(@Query() query: ListQueryDto) {
    return this.listsServices.findAll(query);
  }

  @Get('weeks')
  @Auth()
  findTwoWeeks() {
    return this.listsServices.findUpcoming();
  }

  @Get('next')
  @Auth()
  findNext() {
    return this.listsServices.findNext();
  }

  @Get('weekly/current')
  findCurrentWeekly() {
    return this.listsServices.findCurrentWeeklyLists();
  }

  @Get('weekly/past/:year/:month')
  findPastWeeklyByMonth(@Param() params: ListYearMonthParamsDto) {
    return this.listsServices.findPastWeeklyListsByMonth(
      params.year,
      params.month,
    );
  }

  @Get('video/current')
  findCurrentVideo() {
    return this.listsServices.findCurrentVideoLists();
  }

  @Get('video/past/:year')
  findPastVideoByYear(@Param() params: ListYearParamsDto) {
    return this.listsServices.findPastVideoListsByYear(params.year);
  }

  @Get('special')
  findAllSpecial() {
    return this.listsServices.findAllSpecialLists();
  }

  @Get('video')
  findAllVideo() {
    return this.listsServices.findAllVideoLists();
  }

  @Get('month/current')
  findCurrentMonth() {
    return this.listsServices.findCurrentMonthLists();
  }

  @Get('month/past/:year')
  findPastMonthByYear(@Param() params: ListYearParamsDto) {
    return this.listsServices.findPastMonthListsByYear(params.year);
  }

  @Get('video/current')
  findCurrentVideos() {
    return this.listsServices.findCurrentVideoLists();
  }

  @Get('video/past/:year')
  findPastVideosByYear(@Param() params: ListYearParamsDto) {
    return this.listsServices.findPastVideoListsByYear(params.year);
  }

  @Post('weekly/create')
  @Auth(ValidRoles.riffvalley)
  createWeekly(@Body() createWeeklyListDto: CreateWeeklyListDto) {
    return this.listsServices.createWeeklyList(
      new Date(createWeeklyListDto.releaseDate),
    );
  }

  @Post(':id/wp-posts')
  @Auth(ValidRoles.riffvalley)
  generateWpPosts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GenerateWpPostsQueryDto,
  ) {
    return this.listsServices.generateWordPressPosts(id, query.position);
  }

  @Post(':id/wp-best-post')
  @Auth(ValidRoles.riffvalley)
  generateWpBestPost(@Param('id', ParseUUIDPipe) id: string) {
    return this.listsServices.generateBestDiscsWordPressPost(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.listsServices.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateListDto: UpdateListDto,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
    @Headers('x-content-calendar-client-id') legacySourceId?: string,
  ) {
    return this.listsServices.update(
      id,
      updateListDto,
      contentCalendarMutationContext(user, sourceId ?? legacySourceId),
    );
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  removeList(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
    @Headers('x-content-calendar-client-id') legacySourceId?: string,
  ) {
    return this.listsServices.removeList(
      id,
      undefined,
      contentCalendarMutationContext(user, sourceId ?? legacySourceId),
    );
  }
}
