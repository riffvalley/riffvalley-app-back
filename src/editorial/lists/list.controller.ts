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
import { ListsService } from './list.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { GenerateWpPostsQueryDto } from './dto/generate-wp-posts-query.dto';
import {
  ListYearMonthParamsDto,
  ListYearParamsDto,
} from './dto/list-period-params.dto';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { GetUser } from 'src/identity/auth/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

@Controller('lists')
export class ListsController {
  constructor(private readonly listsServices: ListsService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createListDto: CreateListDto) {
    return this.listsServices.create(createListDto);
  }

  @Get()
  @Auth()
  findAll(@Query() paginationDto: PaginationDto, @GetUser() user: User) {
    return this.listsServices.findAll(paginationDto);
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
  createWeekly() {
    return this.listsServices.createWeeklyList();
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
  ) {
    return this.listsServices.update(id, updateListDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  removeList(@Param('id', ParseUUIDPipe) id: string) {
    return this.listsServices.removeList(id);
  }
}
