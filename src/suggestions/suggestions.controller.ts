import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { UpdateSuggestionDto, RejectSuggestionDto, DoneSuggestionDto } from './dto/update-suggestion.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/auth/entities/user.entity';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';

@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Post()
  @Auth()
  create(@Body() dto: CreateSuggestionDto, @GetUser() user: User) {
    return this.suggestionsService.create(dto, user);
  }

  @Get()
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  findAll() {
    return this.suggestionsService.findAll();
  }

  @Get('my')
  @Auth()
  findMine(@GetUser() user: User) {
    return this.suggestionsService.findByUser(user);
  }

  @Get(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suggestionsService.findOne(id);
  }

  @Patch(':id')
  @Auth()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSuggestionDto) {
    return this.suggestionsService.update(id, dto);
  }

  @Patch(':id/progress')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  setInProgress(@Param('id', ParseUUIDPipe) id: string) {
    return this.suggestionsService.setInProgress(id);
  }

  @Patch(':id/reject')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectSuggestionDto) {
    return this.suggestionsService.reject(id, dto);
  }

  @Patch(':id/done')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  markDone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DoneSuggestionDto) {
    return this.suggestionsService.markDone(id, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin, ValidRoles.riffValley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.suggestionsService.remove(id);
  }
}
