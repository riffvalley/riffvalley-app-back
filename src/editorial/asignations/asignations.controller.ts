import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { AsignationsService } from './asignations.service';
import { CreateAsignationDto } from './dto/create-asignations.dto';
import { UpdateAsignationDto } from './dto/update-asignations.dto';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

@Controller('asignations')
export class AsignationsController {
  constructor(private readonly asignationsService: AsignationsService) {}

  @Post()
  @Auth()
  create(@Body() createAsignationDto: CreateAsignationDto) {
    return this.asignationsService.create(createAsignationDto);
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.asignationsService.findAll(paginationDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.asignationsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAsignationDto: UpdateAsignationDto,
  ) {
    return this.asignationsService.update(id, updateAsignationDto);
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.asignationsService.remove(id);
  }

  @Get('list/:listId')
  async findByListId(
    @Param('listId') listId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.asignationsService.findByListId(listId, paginationDto);
  }
}
