import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/auth/entities/user.entity';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @Auth()
  create(@Body() dto: CreateRequestDto, @GetUser() user: User) {
    return this.requestsService.create(dto, user);
  }

  @Get()
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  findAll() {
    return this.requestsService.findAll();
  }

  @Get('my')
  @Auth()
  findMine(@GetUser() user: User) {
    return this.requestsService.findByUser(user);
  }

  @Get(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.requestsService.findOne(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRequestDto) {
    return this.requestsService.update(id, dto);
  }

  @Post(':id/approve')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.requestsService.approve(id);
  }

  @Post(':id/reopen')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  reopen(@Param('id', ParseUUIDPipe) id: string) {
    return this.requestsService.reopen(id);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('adminNotes') adminNotes: string,
  ) {
    if (!adminNotes?.trim()) {
      throw new BadRequestException('El motivo del rechazo es obligatorio');
    }
    return this.requestsService.reject(id, adminNotes);
  }
}
