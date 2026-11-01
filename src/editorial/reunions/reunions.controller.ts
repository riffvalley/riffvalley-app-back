import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Patch,
  Headers,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ReunionService } from './reunions.service';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { GetUser } from 'src/identity/authorization/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { contentCalendarMutationContext } from 'src/editorial/contents/realtime/contracts/content-calendar-event.contract';
import { ReunionsStreamService } from './realtime/reunions-stream.service';

@Controller('reunions')
export class ReunionController {
  constructor(
    private readonly reunionService: ReunionService,
    private readonly streamService: ReunionsStreamService,
  ) {}

  @Get('events')
  @Auth(ValidRoles.riffvalley)
  openStream(@Req() request: Request, @Res() response: Response): void {
    this.streamService.open(request, response);
  }

  @Post()
  @Auth(ValidRoles.riffvalley)
  async create(@Body() createReunionDto: CreateReunionDto) {
    return this.reunionService.createReunion(createReunionDto);
  }

  @Get()
  async findAll() {
    return this.reunionService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.reunionService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  async update(@Param('id') id: string, @Body() updateData: UpdateReunionDto) {
    return this.reunionService.updateReunion(id, updateData);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  async remove(
    @Param('id') id: string,
    @GetUser() user?: User,
    @Headers('x-content-calendar-client-id') sourceId?: string,
  ) {
    return this.reunionService.deleteReunion(
      id,
      contentCalendarMutationContext(user, sourceId),
    );
  }
}
