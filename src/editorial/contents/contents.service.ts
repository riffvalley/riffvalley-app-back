import { Injectable } from '@nestjs/common';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { Content } from './entities/content.entity';
import { ContentQueryService } from './application/content-query.service';
import { ContentCreationService } from './application/content-creation.service';
import { ContentLifecycleService } from './application/content-lifecycle.service';
import { ContentCalendarMutationContext } from './realtime/contracts/content-calendar-event.contract';

@Injectable()
export class ContentsService {
  constructor(
    private readonly contentQueryService: ContentQueryService,
    private readonly contentCreationService: ContentCreationService,
    private readonly contentLifecycleService: ContentLifecycleService,
  ) {}

  async create(
    createContentDto: CreateContentDto,
    context?: ContentCalendarMutationContext,
  ): Promise<Content> {
    return context
      ? this.contentCreationService.create(createContentDto, context)
      : this.contentCreationService.create(createContentDto);
  }

  async findAll(ready?: boolean, backlog?: boolean): Promise<Content[]> {
    return this.contentQueryService.findAll(ready, backlog);
  }

  async findOne(id: string): Promise<Content> {
    return this.contentQueryService.findOne(id);
  }

  async update(
    id: string,
    updateContentDto: UpdateContentDto,
    context?: ContentCalendarMutationContext,
  ): Promise<Content> {
    return context
      ? this.contentLifecycleService.update(id, updateContentDto, context)
      : this.contentLifecycleService.update(id, updateContentDto);
  }

  async remove(
    id: string,
    context?: ContentCalendarMutationContext,
  ): Promise<void> {
    return context
      ? this.contentLifecycleService.remove(id, context)
      : this.contentLifecycleService.remove(id);
  }

  async findByMonth(year: number, month: number): Promise<Content[]> {
    return this.contentQueryService.findByMonth(year, month);
  }

  async findOneByRiffValleyPlaylistId(
    riffValleyPlaylistId: string,
  ): Promise<Content | null> {
    return this.contentQueryService.findOneByRiffValleyPlaylistId(
      riffValleyPlaylistId,
    );
  }

  async findOneByArticleId(articleId: string): Promise<Content | null> {
    return this.contentQueryService.findOneByArticleId(articleId);
  }

  async findOneByVideoId(videoId: string): Promise<Content | null> {
    return this.contentQueryService.findOneByVideoId(videoId);
  }

  async getDefaultAuthorId(): Promise<string> {
    return this.contentQueryService.getDefaultAuthorId();
  }
}
