import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../../identity/auth/decorators/auth.decorator';
import { ValidRoles } from '../../identity/auth/interfaces/valid-roles';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsQueryDto } from './dto/events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventArtistTourDto } from './dto/update-event-artist-tour.dto';
import { ImportEventsBatchDto } from './dto/import-batch.dto';
import { EventsService } from './events.service';
import { EventsImportBatchService } from './import-batch/events-import-batch.service';
import { ImportEventLineupDto } from './dto/import-lineup.dto';
import {
  ImportEventLineupService,
  LineupExpansionResult,
} from './import-lineup/import-event-lineup.service';
import { User } from '../../identity/auth/entities/user.entity';
import { GetUser } from '../../identity/auth/decorators/get-user.decorator';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventsImportBatchService: EventsImportBatchService,
    private readonly importEventLineupService: ImportEventLineupService,
  ) {}

  @Post('import-batch')
  @Auth(ValidRoles.riffvalley)
  importBatch(
    @Body() dto: ImportEventsBatchDto,
    @GetUser() user: User,
  ): Promise<{ batchId: string; results: unknown[] }> {
    return this.eventsImportBatchService.importBatch(user.id, dto);
  }

  @Post(':eventId/import-lineup')
  @Auth(ValidRoles.riffvalley)
  importLineup(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ImportEventLineupDto,
    @GetUser() user: User,
  ): Promise<LineupExpansionResult> {
    return this.importEventLineupService.expand(user.id, eventId, dto);
  }

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() dto: CreateEventDto) {
    return this.eventsService.create(dto);
  }

  @Get()
  findAll(@Query() query: EventsQueryDto) {
    return this.eventsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, dto);
  }

  @Patch(':eventId/artists/:eventArtistId')
  @Auth(ValidRoles.riffvalley)
  updateArtistTour(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('eventArtistId', ParseUUIDPipe) eventArtistId: string,
    @Body() dto: UpdateEventArtistTourDto,
  ) {
    return this.eventsService.updateArtistTour(eventId, eventArtistId, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.remove(id);
  }
}
