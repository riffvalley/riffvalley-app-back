import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Patch,
  Headers,
} from '@nestjs/common';
import { PointService } from './points.service';
import { CreatePointDto } from './dto/create-points.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { GetUser } from 'src/identity/authorization/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { reunionsMutationContext } from '../realtime/contracts/reunions-event.contract';

@Controller('points')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  async create(
    @Body() createPointDto: CreatePointDto,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
    @Headers('x-content-calendar-client-id') legacySourceId?: string,
  ) {
    return this.pointService.createPoint(
      createPointDto,
      reunionsMutationContext(user, sourceId ?? legacySourceId),
    );
  }

  @Get()
  async findAll() {
    return this.pointService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.pointService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  async update(
    @Param('id') id: string,
    @Body() updateData: UpdatePointDto,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
    @Headers('x-content-calendar-client-id') legacySourceId?: string,
  ) {
    return this.pointService.updatePoint(
      id,
      updateData,
      reunionsMutationContext(user, sourceId ?? legacySourceId),
    );
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  async remove(
    @Param('id') id: string,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
    @Headers('x-content-calendar-client-id') legacySourceId?: string,
  ) {
    return this.pointService.deletePoint(
      id,
      reunionsMutationContext(user, sourceId ?? legacySourceId),
    );
  }
}
