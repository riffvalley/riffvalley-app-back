import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Patch,
} from '@nestjs/common';
import { ReunionService } from './reunions.service';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

@Controller('reunions')
export class ReunionController {
  constructor(private readonly reunionService: ReunionService) {}

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
  async remove(@Param('id') id: string) {
    return this.reunionService.deleteReunion(id);
  }
}
