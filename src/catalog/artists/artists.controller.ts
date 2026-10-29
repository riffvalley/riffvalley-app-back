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
import { ArtistsService } from './artists.service';
import { CreateArtistDto } from './dto/create-artist.dto';
import { UpdateArtistDto } from './dto/update-artist.dto';
import { ArtistManagementQueryDto } from './dto/artist-management-query.dto';
import { ArtistDirectoryQueryDto } from './directory/dto/artist-directory-query.dto';
import { FillArtistImagesDto } from './images/dto/fill-artist-images.dto';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';

@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Post()
  @Auth(ValidRoles.riffvalley)
  create(@Body() createArtistDto: CreateArtistDto) {
    return this.artistsService.create(createArtistDto);
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.artistsService.findAll(paginationDto);
  }

  @Get('management')
  findAllForManagement(@Query() managementQuery: ArtistManagementQueryDto) {
    return this.artistsService.findAllForManagement(
      managementQuery.query,
      managementQuery.limit !== undefined ? Number(managementQuery.limit) : 15,
      managementQuery.offset !== undefined ? Number(managementQuery.offset) : 0,
      managementQuery.genreId,
      managementQuery.needsReview !== undefined
        ? managementQuery.needsReview === 'true'
        : undefined,
    );
  }

  @Get('directory')
  findDirectory(@Query() directoryQuery: ArtistDirectoryQueryDto) {
    return this.artistsService.findDirectory(directoryQuery);
  }

  @Get('images/fill/preview')
  @Auth(ValidRoles.superadmin)
  previewImageFill() {
    return this.artistsService.previewImageFill();
  }

  @Post('images/fill')
  @Auth(ValidRoles.superadmin)
  fillImages(@Body() dto: FillArtistImagesDto) {
    return this.artistsService.fillImages(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.artistsService.findOne(id);
  }

  @Get(':id/details')
  findOneWithDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.artistsService.findOneWithDetails(id);
  }

  @Get('/search/by-name')
  findByName(@Query('name') name: string) {
    return this.artistsService.findByName(name);
  }

  @Patch(':id')
  @Auth(ValidRoles.riffvalley)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateArtistDto: UpdateArtistDto,
  ) {
    return this.artistsService.update(id, updateArtistDto);
  }

  @Delete('orphans/all')
  @Auth(ValidRoles.riffvalley)
  removeOrphans() {
    return this.artistsService.removeOrphanArtists();
  }

  @Delete(':id')
  @Auth(ValidRoles.riffvalley)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.artistsService.remove(id);
  }
}
