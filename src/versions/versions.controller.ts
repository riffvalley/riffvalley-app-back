// versions/versions.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { VersionsService } from './versions.service';
import { CreateVersionDto } from './dto/create-version.dto';
import { UpdateVersionDto } from './dto/update-version.dto';
import { CreateVersionItemDto } from './dto/create-version-item.dto';
import { UpdateVersionItemDto } from './dto/update-version-item.dto';

@Controller('versions')
export class VersionsController {
  constructor(private readonly versionsService: VersionsService) { }

  // ---- Version CRUD ----
  @Post()
  create(@Body() dto: CreateVersionDto) {
    return this.versionsService.create(dto);
  }

  // ---- Independent Items (Backlog) ----
  // Must be before :id routes to avoid conflict
  @Get('items')
  listIndependentItems() {
    return this.versionsService.listIndependentItems();
  }

  @Get('current/items')
  listCurrentVersionItems() {
    return this.versionsService.listCurrentVersionItems();
  }

  @Post('items')
  createIndependentItem(@Body() dto: CreateVersionItemDto) {
    return this.versionsService.createItem(dto);
  }

  @Patch('items/:itemId')
  updateIndependentItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateVersionItemDto,
  ) {
    return this.versionsService.updateItem(itemId, dto);
  }

  @Delete('items/:itemId')
  removeIndependentItem(@Param('itemId') itemId: string) {
    return this.versionsService.removeItem(itemId);
  }

  // ---- Specific Routes (Must be before :id) ----
  @Get('public')
  findPublic() {
    return this.versionsService.findPublic();
  }

  @Get('dev')
  findDevStatus() {
    return this.versionsService.findDevStatus();
  }

  @Get('draft/latest')
  findLatestDraft() {
    return this.versionsService.findLatestDraft();
  }

  @Get('production/paginated')
  findProductionPaginated(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 9;
    return this.versionsService.findProductionPaginated(pageNum, limitNum);
  }

  @Get('production/latest')
  findLatestProductionVersion() {
    return this.versionsService.findLatestProductionVersion();
  }

  @Get()
  findAll() {
    return this.versionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.versionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVersionDto) {
    return this.versionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.versionsService.remove(id);
  }

  // ---- Nested Items CRUD ----
  @Get(':versionId/items')
  listItems(@Param('versionId') versionId: string) {
    return this.versionsService.listItems(versionId);
  }

  @Post(':versionId/items')
  createItem(
    @Param('versionId') versionId: string,
    @Body() dto: CreateVersionItemDto,
  ) {
    return this.versionsService.createItem(dto, versionId);
  }

  @Patch(':versionId/items/:itemId')
  updateItem(
    @Param('versionId') versionId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateVersionItemDto,
  ) {
    return this.versionsService.updateItem(itemId, dto, versionId);
  }

  @Delete(':versionId/items/:itemId')
  removeItem(
    @Param('versionId') versionId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.versionsService.removeItem(itemId, versionId);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body('active') active: boolean) {
    return this.versionsService.setActive(id, active);
  }
}
