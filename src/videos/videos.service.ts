import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  In,
} from 'typeorm';
import { Video, VideoStatus as VideoStatusEnum } from './entities/video.entity';
import { ContentsService } from 'src/contents/contents.service';
import { ContentType } from 'src/contents/entities/content.entity';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { ListsService } from 'src/lists/list.service';

export type VideoStatus =
  | 'not_started'
  | 'in_progress'
  | 'editing'
  | 'ready'
  | 'published';

export type VideoType = 'best' | 'custom';

export interface FindVideoParams {
  limit?: number;
  offset?: number;
  q?: string;
  status?: VideoStatus;
  type?: VideoType | VideoType[];
  desde?: string;
  hasta?: string;
  userId?: string;
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly repo: Repository<Video>,
    @Inject(forwardRef(() => ContentsService))
    private readonly contentsService: ContentsService,
    private readonly listsService: ListsService,
  ) {}

  async create(createVideoDto: CreateVideoDto): Promise<Video> {
    const entity = this.repo.create({
      ...createVideoDto,
      updateDate: createVideoDto.updateDate
        ? new Date(createVideoDto.updateDate)
        : null,
      user: createVideoDto.userId ? { id: createVideoDto.userId } : undefined,
      editor: createVideoDto.editorId
        ? { id: createVideoDto.editorId }
        : undefined,
      list: createVideoDto.listId ? { id: createVideoDto.listId } : undefined,
    });
    const savedEntity = await this.repo.save(entity);

    return this.findOne(savedEntity.id);
  }

  async findAll(params: FindVideoParams = {}): Promise<Video[]> {
    const { limit = 50, offset = 0, q, status, type, desde, hasta, userId } = params;

    const baseWhere: any = {
      ...(status ? { status } : {}),
      ...(type ? (Array.isArray(type) ? { type: In(type) } : { type }) : {}),
      ...(desde ? { updateDate: MoreThanOrEqual(new Date(desde)) } : {}),
      ...(hasta ? { updateDate: LessThanOrEqual(new Date(hasta)) } : {}),
      ...(userId ? { user: { id: userId } } : {}),
    };

    const where = q
      ? { ...baseWhere, name: ILike(`%${q}%`) }
      : baseWhere;

    return this.repo.find({
      where,
      order: { updatedAt: 'DESC' },
      take: Math.min(Math.max(0, limit), 200),
      skip: Math.max(0, offset),
      relations: ['user', 'list', 'editor', 'content'],
    });
  }

  async findOne(id: string): Promise<Video> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['user', 'list', 'editor', 'content'],
    });
    if (!entity) throw new NotFoundException('Video not found');
    return entity;
  }

  async update(id: string, updateVideoDto: UpdateVideoDto): Promise<Video> {
    const entity = await this.findOne(id);

    // Update simple fields
    if (updateVideoDto.name) entity.name = updateVideoDto.name;
    if (updateVideoDto.type) entity.type = updateVideoDto.type;
    if (updateVideoDto.updateDate) {
      entity.updateDate = new Date(updateVideoDto.updateDate);
    }

    // Handle User Assignment
    if (updateVideoDto.userId) {
      entity.user = { id: updateVideoDto.userId } as any;
    }

    // Handle Editor Assignment
    if (updateVideoDto.editorId) {
      entity.editor = { id: updateVideoDto.editorId } as any;
    }

    // Handle List Assignment
    if (updateVideoDto.listId !== undefined) {
      entity.list = updateVideoDto.listId
        ? ({ id: updateVideoDto.listId } as any)
        : null;
    }

    // Logic for State Transitions
    // NOTE: this no longer touches Content — Video and Content are fully
    // independent. Creating/linking a Content is a manual, explicit action
    // (see createContentForVideo() / POST /videos/:id/content).
    if (updateVideoDto.status && updateVideoDto.status !== entity.status) {
      if (
        updateVideoDto.status === VideoStatusEnum.EDITING ||
        updateVideoDto.status === VideoStatusEnum.READY
      ) {
        if (!entity.user) {
          throw new BadRequestException(
            `Para cambiar el estado a "${updateVideoDto.status}", el video debe tener un usuario asignado.`,
          );
        }
      } else if (updateVideoDto.status === VideoStatusEnum.PUBLISHED) {
        if (!updateVideoDto.updateDate) {
          throw new BadRequestException(
            'Para cambiar el estado a "published", debe proporcionar una fecha (updateDate).',
          );
        }
        entity.updateDate = new Date(updateVideoDto.updateDate);
      }
    }

    // Apply state change
    if (updateVideoDto.status) entity.status = updateVideoDto.status;

    await this.repo.save(entity);

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const entity = await this.findOne(id);

    const content = await this.contentsService.findOneByVideoId(id);
    if (content) {
      throw new BadRequestException(
        'No se puede eliminar un Video que tiene un Content asociado. Elimina primero ese Content (DELETE /contents/:id).',
      );
    }

    await this.repo.remove(entity);
    return { ok: true };
  }

  async createListForVideo(videoId: string): Promise<Video> {
    const video = await this.findOne(videoId);

    if (video.list) {
      throw new BadRequestException('Este Video ya tiene una List asociada.');
    }

    const list = await this.listsService.createVideoList(
      undefined,
      undefined,
      video.name,
      undefined,
    );

    video.list = list;
    await this.repo.save(video);

    return this.findOne(videoId);
  }

  /**
   * Manual "create content" button: creates a backlog Content (no
   * publicationDate) linked to this Video and stops there — Video and
   * Content stay fully independent afterwards, no further sync happens.
   */
  async createContentForVideo(videoId: string): Promise<Video> {
    const video = await this.findOne(videoId);

    if (video.content) {
      throw new BadRequestException('Este Video ya tiene un Content asociado.');
    }
    if (!video.user) {
      throw new BadRequestException(
        'Para crear el Content asociado, el video debe tener un usuario asignado.',
      );
    }

    await this.contentsService.create({
      name: video.name,
      type: ContentType.VIDEO,
      authorId: video.user.id,
      videoId: video.id,
      backlog: true,
    } as any);

    return this.findOne(videoId);
  }
}
