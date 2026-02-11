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

    // Shortcut: if created with EDITING or READY, auto-create Content
    if (
      savedEntity.status === VideoStatusEnum.EDITING ||
      savedEntity.status === VideoStatusEnum.READY
    ) {
      if (!createVideoDto.userId) {
        throw new BadRequestException(
          'Para crear un Video en estado EDITING, debe tener un usuario asignado.',
        );
      }
      await this.contentsService.create({
        name: savedEntity.name,
        type: ContentType.VIDEO,
        authorId: createVideoDto.userId,
        videoId: savedEntity.id,
      } as any);
    }

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
      relations: ['user', 'list', 'editor'],
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
    let shouldSyncContent = false;
    const contentSyncPayload: any = {};
    let contentId: string | undefined;

    // Update simple fields
    if (updateVideoDto.name) entity.name = updateVideoDto.name;
    if (updateVideoDto.type) entity.type = updateVideoDto.type;
    if (updateVideoDto.updateDate) {
      entity.updateDate = new Date(updateVideoDto.updateDate);
      shouldSyncContent = true;
      contentSyncPayload.publicationDate = entity.updateDate;
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
    if (updateVideoDto.status && updateVideoDto.status !== entity.status) {
      if (updateVideoDto.status === VideoStatusEnum.IN_PROGRESS) {
        // Transitioning to IN_PROGRESS: delete associated Content
        const content = await this.contentsService.findOneByVideoId(id);
        if (content) {
          await this.contentsService.remove(content.id);
        }
      } else if (
        updateVideoDto.status === VideoStatusEnum.EDITING ||
        updateVideoDto.status === VideoStatusEnum.READY
      ) {
        const assignedUser = entity.user;
        if (!assignedUser) {
          throw new BadRequestException(
            `Para cambiar el estado a "${updateVideoDto.status}", el video debe tener un usuario asignado.`,
          );
        }

        const content = await this.contentsService.findOneByVideoId(id);
        if (!content) {
          try {
            const newContent = await this.contentsService.create({
              name: entity.name,
              type: ContentType.VIDEO,
              authorId: assignedUser.id,
              videoId: id,
            } as any);
            entity.content = newContent;
          } catch (error) {
            console.error('Error creating content for Video:', error);
            throw new BadRequestException(
              'Error al crear el contenido asociado: ' + error.message,
            );
          }
        } else {
          shouldSyncContent = true;
          contentId = content.id;
          contentSyncPayload.publicationDate = null;
        }
      } else if (updateVideoDto.status === VideoStatusEnum.PUBLISHED) {
        if (!updateVideoDto.updateDate) {
          throw new BadRequestException(
            'Para cambiar el estado a "published", debe proporcionar una fecha (updateDate).',
          );
        }
        entity.updateDate = new Date(updateVideoDto.updateDate);
        shouldSyncContent = true;
        contentSyncPayload.publicationDate = entity.updateDate;
      }
    }

    // Apply state change
    if (updateVideoDto.status) entity.status = updateVideoDto.status;

    // Save Video Entity FIRST
    await this.repo.save(entity);

    // Sync Content if needed
    if (shouldSyncContent) {
      if (!contentId) {
        const content = await this.contentsService.findOneByVideoId(id);
        if (content) contentId = content.id;
      }

      if (contentId) {
        await this.contentsService.update(contentId, contentSyncPayload);
      }
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const entity = await this.findOne(id);

    const content = await this.contentsService.findOneByVideoId(id);
    if (content) {
      throw new BadRequestException(
        'No se puede eliminar un Video que tiene un Content asociado. Primero pásalo a IN_PROGRESS.',
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
}
