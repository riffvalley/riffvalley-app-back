import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  FindOptionsWhere,
  QueryFailedError,
  Repository,
  In,
} from 'typeorm';
import {
  Video,
  VideoStatus as VideoStatusEnum,
  VideoType as VideoTypeEnum,
} from './entities/video.entity';
import { ContentsService } from 'src/editorial/contents/contents.service';
import { ContentType } from 'src/editorial/contents/entities/content.entity';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { ListsService } from 'src/editorial/lists/list.service';

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

const VIDEO_RELATION_FOREIGN_KEY_CONSTRAINTS = new Set([
  'FK_74e27b13f8ac66f999400df12f6', // video.userId -> users.id
  'FK_326eb34c48fc181639511958a19', // video.editorId -> users.id
  'FK_e7181db8200f878e3ba5fb2486c', // video.listId -> list.id
]);

const VIDEO_STATUSES: Record<VideoStatus, VideoStatusEnum> = {
  not_started: VideoStatusEnum.NOT_STARTED,
  in_progress: VideoStatusEnum.IN_PROGRESS,
  editing: VideoStatusEnum.EDITING,
  ready: VideoStatusEnum.READY,
  published: VideoStatusEnum.PUBLISHED,
};

const VIDEO_TYPES: Record<VideoType, VideoTypeEnum> = {
  best: VideoTypeEnum.BEST,
  custom: VideoTypeEnum.CUSTOM,
};

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
    this.validateStatusRequirements(
      createVideoDto.status,
      Boolean(createVideoDto.userId),
      createVideoDto.updateDate,
      'create',
    );

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
    const savedEntity = await this.saveVideo(entity);

    return this.findOne(savedEntity.id);
  }

  async findAll(params: FindVideoParams = {}): Promise<Video[]> {
    const {
      limit = 50,
      offset = 0,
      q,
      status,
      type,
      desde,
      hasta,
      userId,
    } = params;

    const baseWhere: FindOptionsWhere<Video> = {
      ...(status ? { status: VIDEO_STATUSES[status] } : {}),
      ...(type
        ? {
            type: Array.isArray(type)
              ? In(type.map((videoType) => VIDEO_TYPES[videoType]))
              : VIDEO_TYPES[type],
          }
        : {}),
      ...(desde && hasta
        ? { updateDate: Between(new Date(desde), new Date(hasta)) }
        : desde
          ? { updateDate: MoreThanOrEqual(new Date(desde)) }
          : hasta
            ? { updateDate: LessThanOrEqual(new Date(hasta)) }
            : {}),
      ...(userId ? { user: { id: userId } } : {}),
    };

    const where = q ? { ...baseWhere, name: ILike(`%${q}%`) } : baseWhere;

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

    // Omitted relation fields preserve their current assignments; explicit
    // null clears them. Determine the final state and User together so a
    // combined status/assignment PATCH is validated as one operation.
    if (updateVideoDto.userId !== undefined) {
      this.repo.merge(entity, {
        user: updateVideoDto.userId ? { id: updateVideoDto.userId } : null,
      });
    }

    if (updateVideoDto.editorId !== undefined) {
      this.repo.merge(entity, {
        editor: updateVideoDto.editorId
          ? { id: updateVideoDto.editorId }
          : null,
      });
    }

    // Handle List Assignment
    if (updateVideoDto.listId !== undefined) {
      this.repo.merge(entity, {
        list: updateVideoDto.listId ? { id: updateVideoDto.listId } : null,
      });
    }

    // Logic for State Transitions
    // NOTE: this no longer touches Content — Video and Content are fully
    // independent. Creating/linking a Content is a manual, explicit action
    // (see createContentForVideo() / POST /videos/:id/content).
    const finalStatus = updateVideoDto.status ?? entity.status;
    const statusChanged = finalStatus !== entity.status;
    const userWasExplicitlyCleared = updateVideoDto.userId === null;

    if (statusChanged) {
      this.validateStatusRequirements(
        finalStatus,
        Boolean(entity.user),
        updateVideoDto.updateDate,
        'update',
      );
    } else if (
      userWasExplicitlyCleared &&
      (finalStatus === VideoStatusEnum.EDITING ||
        finalStatus === VideoStatusEnum.READY)
    ) {
      this.validateStatusRequirements(
        finalStatus,
        false,
        updateVideoDto.updateDate,
        'update',
      );
    }

    if (statusChanged && finalStatus === VideoStatusEnum.PUBLISHED) {
      entity.updateDate = new Date(updateVideoDto.updateDate!);
    }

    // Apply state change
    if (updateVideoDto.status) entity.status = updateVideoDto.status;

    await this.saveVideo(entity);

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
    await this.repo.manager.transaction(async (manager) => {
      const videoRepository = manager.getRepository(Video);
      const video = await videoRepository.findOne({
        where: { id: videoId },
        relations: ['list'],
        lock: { mode: 'pessimistic_write', tables: ['video'] },
      });

      if (!video) throw new NotFoundException('Video not found');
      if (video.list) {
        throw new BadRequestException('Este Video ya tiene una List asociada.');
      }

      const list = await this.listsService.createVideoList(
        undefined,
        undefined,
        video.name,
        undefined,
        manager,
      );

      video.list = list;
      await videoRepository.save(video);
    });

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
    });

    return this.findOne(videoId);
  }

  private validateStatusRequirements(
    status: VideoStatusEnum,
    hasUser: boolean,
    updateDate: string | Date | null | undefined,
    operation: 'create' | 'update',
  ): void {
    if (
      (status === VideoStatusEnum.EDITING ||
        status === VideoStatusEnum.READY) &&
      !hasUser
    ) {
      throw new BadRequestException(
        operation === 'create'
          ? `Para crear un video en estado "${status}", debe tener un usuario asignado.`
          : `Para cambiar el estado a "${status}", el video debe tener un usuario asignado.`,
      );
    }

    if (status === VideoStatusEnum.PUBLISHED && !updateDate) {
      throw new BadRequestException(
        operation === 'create'
          ? 'Para crear un video en estado "published", debe proporcionar una fecha (updateDate).'
          : 'Para cambiar el estado a "published", debe proporcionar una fecha (updateDate).',
      );
    }
  }

  private async saveVideo(video: Video): Promise<Video> {
    try {
      return await this.repo.save(video);
    } catch (error) {
      if (this.isVideoRelationForeignKeyViolation(error)) {
        throw new NotFoundException(
          'One or more referenced resources were not found',
        );
      }

      throw error;
    }
  }

  private isVideoRelationForeignKeyViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;

    const driverError: unknown = error.driverError;
    if (typeof driverError !== 'object' || driverError === null) return false;
    return (
      'code' in driverError &&
      driverError.code === '23503' &&
      'table' in driverError &&
      driverError.table === 'video' &&
      'constraint' in driverError &&
      typeof driverError.constraint === 'string' &&
      VIDEO_RELATION_FOREIGN_KEY_CONSTRAINTS.has(driverError.constraint)
    );
  }
}
