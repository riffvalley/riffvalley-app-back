import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { PendingsService } from './pendings.service';
import { CreatePendingDto } from './dto/create-pendings.dto';
import { CommunityListQueryDto } from '../common/dto/community-list-query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { GetUser } from 'src/identity/auth/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';

@Controller('pendings')
export class PendingsController {
  constructor(private readonly pendingsService: PendingsService) {}

  @Post()
  @Auth()
  create(@Body() createPendingDto: CreatePendingDto, @GetUser() user: User) {
    return this.pendingsService.create(createPendingDto, user);
  }

  @Get()
  @Auth()
  findAll(@Query() query: CommunityListQueryDto, @GetUser() user: User) {
    return this.pendingsService.findAllByUser(query, user);
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.pendingsService.findOne(id, user);
  }

  @Delete(':id')
  @Auth()
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.pendingsService.remove(id, user);
  }
}
