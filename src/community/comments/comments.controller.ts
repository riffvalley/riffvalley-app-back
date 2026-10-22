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
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comments.dto';
import { UpdateCommentDto } from './dto/update-comments.dto';
import { CommunityListQueryDto } from '../common/dto/community-list-query.dto';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { GetUser } from 'src/identity/auth/decorators/get-user.decorator';
import { User } from 'src/identity/auth/entities/user.entity';

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @Auth()
  create(@Body() createCommentDto: CreateCommentDto, @GetUser() user: User) {
    return this.commentsService.create(createCommentDto, user);
  }

  @Get()
  @Auth()
  findAll(@Query() query: CommunityListQueryDto, @GetUser() user: User) {
    return this.commentsService.findAllByUser(query, user);
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.commentsService.findOne(id, user);
  }

  @Patch(':id')
  @Auth()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @GetUser() user: User,
  ) {
    return this.commentsService.update(id, updateCommentDto, user);
  }

  @Delete(':id')
  @Auth()
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.commentsService.remove(id, user);
  }

  @Get('/disc/:discId')
  async findCommentsByDisc(@Param('discId') discId: string) {
    return this.commentsService.findCommentsByDisc(discId);
  }
}
