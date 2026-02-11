import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  In,
} from 'typeorm';
import {
  Spotify,
  SpotifyStatus as SpotifyStatusEnum,
} from './entities/spotify.entity';
import { ContentsService } from 'src/contents/contents.service';
import { ContentType } from 'src/contents/entities/content.entity';
import { CreateSpotifyDto } from './dto/create-spotify.dto';
import { UpdateSpotifyDto } from './dto/update-spotify.dto';

// si ya tienes estos tipos en otro archivo, reutilízalos
export type SpotifyStatus =
  | 'not_started'
  | 'in_progress'
  | 'editing'
  | 'ready'
  | 'published';

export type SpotifyType = 'festival' | 'especial' | 'genero' | 'otras';

export interface FindSpotifyParams {
  limit?: number;
  offset?: number;
  q?: string; // busca en nombre/enlace (ILIKE)
  status?: SpotifyStatus;
  type?: SpotifyType | SpotifyType[];
  // opcional: filtros por rango de fechaActualizacion (ISO)
  desde?: string; // >= fechaActualizacion
  hasta?: string; // <= fechaActualizacion
}

@Injectable()
export class SpotifyService {
  constructor(
    @InjectRepository(Spotify)
    private readonly repo: Repository<Spotify>,
    private readonly contentsService: ContentsService,
  ) {}

  async create(createSpotifyDto: CreateSpotifyDto): Promise<Spotify> {
    const entity = this.repo.create({
      ...createSpotifyDto,
      updateDate: new Date(createSpotifyDto.updateDate),
      user: createSpotifyDto.userId
        ? { id: createSpotifyDto.userId }
        : undefined,
    });
    const savedEntity = await this.repo.save(entity);

    // Shortcut: if created with EDITING or READY, auto-create Content
    if (
      savedEntity.status === SpotifyStatusEnum.EDITING ||
      savedEntity.status === SpotifyStatusEnum.READY
    ) {
      if (!savedEntity.user) {
        throw new BadRequestException(
          'Para crear un Spotify en estado EDITING, debe tener un usuario asignado.',
        );
      }
      await this.contentsService.create({
        name: savedEntity.name,
        type: ContentType.SPOTIFY,
        authorId: createSpotifyDto.userId,
        spotifyId: savedEntity.id,
      } as any);
    }

    return this.findOne(savedEntity.id);
  }

  async findAll(params: FindSpotifyParams = {}): Promise<Spotify[]> {
    const { limit = 50, offset = 0, q, status, type, desde, hasta } = params;

    // where base (AND)
    const baseWhere: any = {
      ...(status ? { status } : {}),
      ...(type ? (Array.isArray(type) ? { type: In(type) } : { type }) : {}),
      ...(desde ? { updateDate: MoreThanOrEqual(new Date(desde)) } : {}),
      ...(hasta ? { updateDate: LessThanOrEqual(new Date(hasta)) } : {}),
    };

    // Si hay q, hacemos OR sobre nombre/enlace con ILIKE
    const where = q
      ? [
          { ...baseWhere, name: ILike(`%${q}%`) },
          { ...baseWhere, link: ILike(`%${q}%`) },
        ]
      : baseWhere;

    return this.repo.find({
      where,
      order: { updatedAt: 'DESC' },
      take: Math.min(Math.max(0, limit), 200), // cap de seguridad
      skip: Math.max(0, offset),
      relations: ['user'],
    });
  }

  async findOne(id: string): Promise<Spotify> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['user', 'content'],
    });
    if (!entity) throw new NotFoundException('Spotify item not found');
    return entity;
  }

  async update(
    id: string,
    updateSpotifyDto: UpdateSpotifyDto,
  ): Promise<Spotify> {
    const entity = await this.findOne(id);
    let shouldSyncContent = false;
    const contentSyncPayload: any = {};
    let contentId: string | undefined;

    // Update simple fields
    if (updateSpotifyDto.name) entity.name = updateSpotifyDto.name;
    if (updateSpotifyDto.link) entity.link = updateSpotifyDto.link;
    if (updateSpotifyDto.type) entity.type = updateSpotifyDto.type;
    if (updateSpotifyDto.updateDate) {
      entity.updateDate = new Date(updateSpotifyDto.updateDate);
      // Scheduled sync
      shouldSyncContent = true;
      contentSyncPayload.publicationDate = entity.updateDate;
    }

    // Handle User Assignment
    if (updateSpotifyDto.userId) {
      entity.user = { id: updateSpotifyDto.userId } as any;
    }

    // Logic for State Transitions
    if (updateSpotifyDto.status && updateSpotifyDto.status !== entity.status) {
      if (updateSpotifyDto.status === SpotifyStatusEnum.IN_PROGRESS) {
        // Transitioning to IN_PROGRESS: delete associated Content
        const content = await this.contentsService.findOneBySpotifyId(id);
        if (content) {
          await this.contentsService.remove(content.id);
        }
      } else if (
        updateSpotifyDto.status === SpotifyStatusEnum.EDITING ||
        updateSpotifyDto.status === SpotifyStatusEnum.READY
      ) {
        const assignedUser = entity.user;
        if (!assignedUser) {
          throw new BadRequestException(
            `Para cambiar el estado a "${updateSpotifyDto.status}", el Spotify debe tener un usuario asignado.`,
          );
        }

        const content = await this.contentsService.findOneBySpotifyId(id);
        if (!content) {
          try {
            const newContent = await this.contentsService.create({
              name: entity.name,
              type: ContentType.SPOTIFY,
              authorId: assignedUser.id,
              spotifyId: id,
            } as any);
            entity.content = newContent;
          } catch (error) {
            console.error('Error creating content for Spotify:', error);
            throw new BadRequestException(
              'Error al crear el contenido asociado: ' + error.message,
            );
          }
        } else {
          shouldSyncContent = true;
          contentId = content.id;
          contentSyncPayload.publicationDate = null;
        }
      } else if (updateSpotifyDto.status === SpotifyStatusEnum.PUBLISHED) {
        if (!updateSpotifyDto.updateDate) {
          throw new BadRequestException(
            'Para cambiar el estado a "published", debe proporcionar una fecha (updateDate).',
          );
        }
        entity.updateDate = new Date(updateSpotifyDto.updateDate);
        shouldSyncContent = true;
        contentSyncPayload.publicationDate = entity.updateDate;
      }
    }

    // Apply state change
    if (updateSpotifyDto.status) entity.status = updateSpotifyDto.status;

    // Save Spotify Entity FIRST
    await this.repo.save(entity);

    // Sync Content if needed
    if (shouldSyncContent) {
      if (!contentId) {
        const content = await this.contentsService.findOneBySpotifyId(id);
        if (content) contentId = content.id;
      }

      if (contentId) {
        await this.contentsService.update(contentId, contentSyncPayload);
      }
    }

    // Return the full entity
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const entity = await this.findOne(id);

    const content = await this.contentsService.findOneBySpotifyId(id);
    if (content) {
      throw new BadRequestException(
        'No se puede eliminar un Spotify que tiene un Content asociado. Primero pásalo a IN_PROGRESS.',
      );
    }

    await this.repo.remove(entity);
    return { ok: true };
  }
}
