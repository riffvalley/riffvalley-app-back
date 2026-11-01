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
  Headers,
} from '@nestjs/common';
import { AsignationsService } from './asignations.service';
import { CreateAsignationDto } from './dto/create-asignations.dto';
import { UpdateAsignationDto } from './dto/update-asignations.dto';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { GetUser } from 'src/identity/authorization/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { listsMutationContext } from '../realtime/contracts/lists-event.contract';

@Controller('asignations')
export class AsignationsController {
  constructor(private readonly asignationsService: AsignationsService) {}

  @Post()
  @Auth()
  create(
    @Body() createAsignationDto: CreateAsignationDto,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
  ) {
    return this.asignationsService.create(
      createAsignationDto,
      listsMutationContext(user, sourceId),
    );
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
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
  ) {
    return this.asignationsService.update(
      id,
      updateAsignationDto,
      listsMutationContext(user, sourceId),
    );
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user?: User,
    @Headers('x-riff-valley-client-id') sourceId?: string,
  ) {
    return this.asignationsService.remove(
      id,
      listsMutationContext(user, sourceId),
    );
  }

  @Get('list/:listId')
  async findByListId(
    @Param('listId') listId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.asignationsService.findByListId(listId, paginationDto);
  }
}
