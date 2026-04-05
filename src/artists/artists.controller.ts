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
import { PaginationDto } from 'src/common/dtos/pagination.dto';

@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Post()
  create(@Body() createArtistDto: CreateArtistDto) {
    return this.artistsService.create(createArtistDto);
  }

  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.artistsService.findAll(paginationDto);
  }

  @Get('management')
  findAllForManagement(
    @Query('query') query?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('genreId') genreId?: string,
  ) {
    return this.artistsService.findAllForManagement(
      query,
      limit ? parseInt(limit, 10) : 15,
      offset ? parseInt(offset, 10) : 0,
      genreId,
    );
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
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateArtistDto: UpdateArtistDto,
  ) {
    return this.artistsService.update(id, updateArtistDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.artistsService.remove(id);
  }
}
