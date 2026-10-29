import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { GetUser } from 'src/identity/auth/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import {
  CreateSavedDiscFilterDto,
  UpdateSavedDiscFilterDto,
} from './dto/saved-disc-filter.dto';
import { SavedDiscFiltersService } from './saved-disc-filters.service';

@Controller('discs/list/saved-filters')
@Auth()
export class SavedDiscFiltersController {
  constructor(
    @Inject(SavedDiscFiltersService)
    private readonly savedDiscFiltersService: Pick<
      SavedDiscFiltersService,
      'findAll' | 'create' | 'update' | 'remove'
    >,
  ) {}

  @Get()
  findAll(@GetUser() user: User) {
    return this.savedDiscFiltersService.findAll(user.id);
  }

  @Post()
  create(@Body() dto: CreateSavedDiscFilterDto, @GetUser() user: User) {
    return this.savedDiscFiltersService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedDiscFilterDto,
    @GetUser() user: User,
  ) {
    return this.savedDiscFiltersService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.savedDiscFiltersService.remove(user.id, id);
  }
}
