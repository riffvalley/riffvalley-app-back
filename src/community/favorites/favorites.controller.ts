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
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorites.dto';
import { CommunityListQueryDto } from '../common/dto/community-list-query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { GetUser } from 'src/identity/auth/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @Auth()
  findAll(@Query() query: CommunityListQueryDto, @GetUser() user: User) {
    return this.favoritesService.findAllByUser(query, user);
  }

  @Post()
  @Auth()
  create(@Body() createFavoriteDto: CreateFavoriteDto, @GetUser() user: User) {
    return this.favoritesService.create(createFavoriteDto, user);
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.favoritesService.findOne(id, user);
  }

  @Delete(':id')
  @Auth()
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.favoritesService.remove(id, user);
  }
}
