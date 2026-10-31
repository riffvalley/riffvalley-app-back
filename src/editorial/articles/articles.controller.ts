import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { FindArticlesQueryDto } from './dto/find-articles-query.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { toPublicContentReference } from 'src/editorial/contents/serialization/public-content-reference';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createArticleDto: CreateArticleDto) {
    return this.articlesService
      .create(createArticleDto)
      .then(toPublicContentReference);
  }

  @Get()
  findAll(@Query() query: FindArticlesQueryDto) {
    return this.articlesService
      .findAll(query)
      .then((articles) => articles.map(toPublicContentReference));
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.findOne(id).then(toPublicContentReference);
  }

  // Manual "create content" button: creates a backlog Content linked to
  // this Article. Article and Content stay independent from then on.
  @Post(':id/content')
  @Auth(ValidRoles.riffvalley)
  createContent(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService
      .createContentForArticle(id)
      .then(toPublicContentReference);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateArticleDto: UpdateArticleDto,
  ) {
    return this.articlesService
      .update(id, updateArticleDto)
      .then(toPublicContentReference);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.remove(id);
  }
}
