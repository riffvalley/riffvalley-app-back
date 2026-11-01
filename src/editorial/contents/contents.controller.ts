import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Headers,
} from '@nestjs/common';
import { ContentsService } from './contents.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { FindContentByMonthQueryDto } from './dto/find-content-by-month-query.dto';

import { DiscLinkMaintenanceService } from 'src/catalog/discs/maintenance/disc-link-maintenance.service';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { GetUser } from 'src/identity/authorization/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { contentCalendarMutationContext } from './realtime/contracts/content-calendar-event.contract';

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
  create(
    @Body() createContentDto: CreateContentDto,
    @GetUser() user?: User,
    @Headers('x-content-calendar-client-id') sourceId?: string,
  ) {
    return this.contentsService.create(
      createContentDto,
      contentCalendarMutationContext(user, sourceId),
    );
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
  update(
    @Param('id') id: string,
    @Body() updateContentDto: UpdateContentDto,
    @GetUser() user?: User,
    @Headers('x-content-calendar-client-id') sourceId?: string,
  ) {
    return this.contentsService.update(
      id,
      updateContentDto,
      contentCalendarMutationContext(user, sourceId),
    );
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(
    @Param('id') id: string,
    @GetUser() user?: User,
    @Headers('x-content-calendar-client-id') sourceId?: string,
  ) {
    return this.contentsService.remove(
      id,
      contentCalendarMutationContext(user, sourceId),
    );
  }
}
