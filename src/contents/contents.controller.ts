import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

import { ContentSchedulerService } from './content-scheduler.service';

@Controller('contents')
export class ContentsController {
  constructor(
    private readonly contentsService: ContentsService,
    private readonly contentSchedulerService: ContentSchedulerService,
  ) { }

  @Post('trigger-daily-link-update')
  async triggerDailyLinkUpdate() {
    await this.contentSchedulerService.checkMissingSpotifyLinks();
    return { message: 'Daily link update triggered' };
  }

  @Post()
  create(@Body() createContentDto: CreateContentDto) {
    return this.contentsService.create(createContentDto);
  }

  @Get('by-month')
  findByMonth(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    return this.contentsService.findByMonth(yearNum, monthNum);
  }

  @Get()
  findAll(@Query('ready') ready?: string, @Query('backlog') backlog?: string) {
    const isReady = ready === 'true' ? true : ready === 'false' ? false : undefined;
    const isBacklog = backlog === 'true' ? true : backlog === 'false' ? false : undefined;
    return this.contentsService.findAll(isReady, isBacklog);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateContentDto: UpdateContentDto) {
    return this.contentsService.update(id, updateContentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contentsService.remove(id);
  }
}
