import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { ArticlesService, FindArticleParams } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

@Controller('articles')
export class ArticlesController {
    constructor(private readonly articlesService: ArticlesService) { }

    @Post()
    create(@Body() createArticleDto: CreateArticleDto) {
        return this.articlesService.create(createArticleDto);
    }

    @Get()
    findAll(@Query() query: FindArticleParams) {
        return this.articlesService.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.articlesService.findOne(id);
    }

    // Manual "create content" button: creates a backlog Content linked to
    // this Article. Article and Content stay independent from then on.
    @Post(':id/content')
    createContent(@Param('id', ParseUUIDPipe) id: string) {
        return this.articlesService.createContentForArticle(id);
    }

    @Patch(':id')
    update(@Param('id', ParseUUIDPipe) id: string, @Body() updateArticleDto: UpdateArticleDto) {
        return this.articlesService.update(id, updateArticleDto);
    }

    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.articlesService.remove(id);
    }
}
