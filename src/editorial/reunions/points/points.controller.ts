import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Patch,
} from '@nestjs/common';
import { PointService } from './points.service';
import { CreatePointDto } from './dto/create-points.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

@Controller('points')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  async create(@Body() createPointDto: CreatePointDto) {
    return this.pointService.createPoint(createPointDto);
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
  async update(@Param('id') id: string, @Body() updateData: UpdatePointDto) {
    return this.pointService.updatePoint(id, updateData);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  async remove(@Param('id') id: string) {
    return this.pointService.deletePoint(id);
  }
}
