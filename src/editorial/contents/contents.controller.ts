import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ContentsService } from './contents.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { FindContentByMonthQueryDto } from './dto/find-content-by-month-query.dto';

import { DiscLinkMaintenanceService } from 'src/catalog/discs/maintenance/disc-link-maintenance.service';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

@Controller('contents')
export class ContentsController {
  constructor(
    private readonly contentsService: ContentsService,
    private readonly discLinkMaintenanceService: DiscLinkMaintenanceService,
  ) {}

  @Post('trigger-daily-link-update')
  @Auth(ValidRoles.riffvalley)
  async triggerDailyLinkUpdate() {
    await this.discLinkMaintenanceService.checkMissingSpotifyLinks();
    return { message: 'Daily link update triggered' };
  }

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createContentDto: CreateContentDto) {
    return this.contentsService.create(createContentDto);
  }

  @Get('by-month')
  @Auth(ValidRoles.riffvalley)
  findByMonth(@Query() query: FindContentByMonthQueryDto) {
    return this.contentsService.findByMonth(query.year, query.month);
  }

  @Get()
  @Auth(ValidRoles.riffvalley)
  findAll(@Query('ready') ready?: string, @Query('backlog') backlog?: string) {
    const isReady =
      ready === 'true' ? true : ready === 'false' ? false : undefined;
    const isBacklog =
      backlog === 'true' ? true : backlog === 'false' ? false : undefined;
    return this.contentsService.findAll(isReady, isBacklog);
  }

  @Get(':id')
  @Auth(ValidRoles.riffvalley)
  findOne(@Param('id') id: string) {
    return this.contentsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(@Param('id') id: string, @Body() updateContentDto: UpdateContentDto) {
    return this.contentsService.update(id, updateContentDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id') id: string) {
    return this.contentsService.remove(id);
  }
}
