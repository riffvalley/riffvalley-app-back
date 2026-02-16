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
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { PaginationDto } from '../common/dtos/pagination.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Post()
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  create(@Body() createNewsDto: CreateNewsDto) {
    return this.newsService.create(createNewsDto);
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.newsService.findAll(paginationDto);
  }

  @Get('feed')
  getFeed() {
    return this.newsService.getFeed();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateNewsDto: UpdateNewsDto,
  ) {
    return this.newsService.update(id, updateNewsDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin, ValidRoles.superUser)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.remove(id);
  }
}
