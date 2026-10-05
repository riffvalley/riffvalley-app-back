import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RiffValleyPlaylist,
  RiffValleyPlaylistStatus as RiffValleyPlaylistStatusEnum,
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from './entities/riff-valley-playlist.entity';
import { ContentsService } from 'src/contents/contents.service';
import { ContentType } from 'src/contents/entities/content.entity';
import { CreateRiffValleyPlaylistDto } from './dto/create-riff-valley-playlist.dto';
import { UpdateRiffValleyPlaylistDto } from './dto/update-riff-valley-playlist.dto';

// si ya tienes estos tipos en otro archivo, reutilízalos
export interface FindRiffValleyPlaylistsParams {
  limit?: number;
  offset?: number;
  q?: string; // busca en nombre/enlace (ILIKE)
  status?: RiffValleyPlaylistStatusFilter;
  type?: RiffValleyPlaylistTypeFilter | RiffValleyPlaylistTypeFilter[];
  // opcional: filtros por rango de fechaActualizacion (ISO)
  desde?: string; // >= fechaActualizacion
  hasta?: string; // <= fechaActualizacion
}

type RiffValleyPlaylistStatusFilter =
  | 'not_started'
  | 'in_progress'
  | 'editing'
  | 'ready'
  | 'published';
type RiffValleyPlaylistTypeFilter = 'festival' | 'especial' | 'genero' | 'otras';

@Injectable()
export class RiffValleyPlaylistService {
  constructor(
    @InjectRepository(RiffValleyPlaylist)
    private readonly repo: Repository<RiffValleyPlaylist>,
    private readonly contentsService: ContentsService,
  ) {}

  async create(createRiffValleyPlaylistDto: CreateRiffValleyPlaylistDto): Promise<RiffValleyPlaylist> {
    const entity = this.repo.create({
      ...createRiffValleyPlaylistDto,
      updateDate: new Date(createRiffValleyPlaylistDto.updateDate),
      user: createRiffValleyPlaylistDto.userId
        ? { id: createRiffValleyPlaylistDto.userId }
        : undefined,
    });
    const savedEntity = await this.repo.save(entity);

    return this.findOne(savedEntity.id);
  }

  async findAll(params: FindRiffValleyPlaylistsParams = {}): Promise<RiffValleyPlaylist[]> {
    const { limit = 50, offset = 0, q, status, type, desde, hasta } = params;
    const query = this.repo
      .createQueryBuilder('riffValleyPlaylist')
      .leftJoinAndSelect('riffValleyPlaylist.user', 'user')
      .leftJoinAndSelect('riffValleyPlaylist.content', 'content')
      .loadRelationCountAndMap(
        'riffValleyPlaylist.playlistArtistsCount',
        'riffValleyPlaylist.playlistArtists',
      )
      .orderBy('riffValleyPlaylist.updatedAt', 'DESC')
      .take(Math.min(Math.max(0, limit), 200))
      .skip(Math.max(0, offset));

    if (status) query.andWhere('riffValleyPlaylist.status = :status', { status });
    if (Array.isArray(type)) {
      query.andWhere('riffValleyPlaylist.type IN (:...types)', { types: type });
    } else if (type) {
      query.andWhere('riffValleyPlaylist.type = :type', { type });
    }
    if (desde) {
      query.andWhere('riffValleyPlaylist.updateDate >= :desde', {
        desde: new Date(desde),
      });
    }
    if (hasta) {
      query.andWhere('riffValleyPlaylist.updateDate <= :hasta', {
        hasta: new Date(hasta),
      });
    }
    if (q) {
      query.andWhere('(riffValleyPlaylist.name ILIKE :q OR riffValleyPlaylist.link ILIKE :q)', {
        q: `%${q}%`,
      });
    }

    return query.getMany();
  }

  // Elige al azar una de las playlists de género ya curadas y publicadas
  // (mismo criterio que findGenres), para el widget de "playlist aleatoria".
  async findRandomGenrePlaylist(): Promise<RiffValleyPlaylist> {
    const entity = await this.repo
      .createQueryBuilder('riffValleyPlaylist')
      .where('riffValleyPlaylist.type IN (:...types)', {
        types: ['genero', 'especial', 'otras'],
      })
      .andWhere('riffValleyPlaylist.status = :status', {
        status: RiffValleyPlaylistStatusEnum.PUBLISHED,
      })
      .andWhere("riffValleyPlaylist.link != ''")
      .orderBy('RANDOM()')
      .limit(1)
      .getOne();

    if (!entity) {
      throw new NotFoundException('No hay playlists de género publicadas');
    }

    return entity;
  }

  async findOne(id: string): Promise<RiffValleyPlaylist> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: [
        'user',
        'content',
        'playlistArtists',
        'playlistArtists.artist',
      ],
    });
    if (!entity) throw new NotFoundException('Riff Valley playlist not found');
    return entity;
  }

  async update(
    id: string,
    updateRiffValleyPlaylistDto: UpdateRiffValleyPlaylistDto,
  ): Promise<RiffValleyPlaylist> {
    const entity = await this.findOne(id);

    // Update simple fields
    if (updateRiffValleyPlaylistDto.name) entity.name = updateRiffValleyPlaylistDto.name;
    if (updateRiffValleyPlaylistDto.link) entity.link = updateRiffValleyPlaylistDto.link;
    if (updateRiffValleyPlaylistDto.type) entity.type = updateRiffValleyPlaylistDto.type;
    if (updateRiffValleyPlaylistDto.updateDate) {
      entity.updateDate = new Date(updateRiffValleyPlaylistDto.updateDate);
    }

    // Handle User Assignment
    if (updateRiffValleyPlaylistDto.userId) {
      entity.user = { id: updateRiffValleyPlaylistDto.userId } as any;
    }

    // Logic for State Transitions
    // NOTE: this no longer touches Content — Riff Valley playlist and Content are fully
    // independent. Creating/linking a Content is a manual, explicit action
    // (see createContentForRiffValleyPlaylist() / POST /riff-valley-playlists/:id/content).
    if (updateRiffValleyPlaylistDto.status && updateRiffValleyPlaylistDto.status !== entity.status) {
      if (updateRiffValleyPlaylistDto.status === RiffValleyPlaylistStatusEnum.READY) {
        if (!entity.user) {
          throw new BadRequestException(
            `Para cambiar el estado a "${updateRiffValleyPlaylistDto.status}", la playlist de Riff Valley debe tener un usuario asignado.`,
          );
        }
      } else if (updateRiffValleyPlaylistDto.status === RiffValleyPlaylistStatusEnum.PUBLISHED) {
        if (!updateRiffValleyPlaylistDto.updateDate) {
          throw new BadRequestException(
            'Para cambiar el estado a "published", debe proporcionar una fecha (updateDate).',
          );
        }
        entity.updateDate = new Date(updateRiffValleyPlaylistDto.updateDate);
      }
    }

    // Apply state change
    if (updateRiffValleyPlaylistDto.status) entity.status = updateRiffValleyPlaylistDto.status;

    await this.repo.save(entity);

    // Return the full entity
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const entity = await this.findOne(id);

    const content = await this.contentsService.findOneByRiffValleyPlaylistId(id);
    if (content) {
      throw new BadRequestException(
        'No se puede eliminar una playlist de Riff Valley que tiene un Content asociado. Elimina primero ese Content (DELETE /contents/:id).',
      );
    }

    await this.repo.remove(entity);
    return { ok: true };
  }

  /**
   * Manual action creates a backlog Content linked to this local playlist.
   */
  async createContentForRiffValleyPlaylist(id: string): Promise<RiffValleyPlaylist> {
    const riffValleyPlaylist = await this.findOne(id);

    if (riffValleyPlaylist.content) {
      throw new BadRequestException(
        'Esta playlist de Riff Valley ya tiene un Content asociado.',
      );
    }
    if (!riffValleyPlaylist.user) {
      throw new BadRequestException(
        'Para crear el Content asociado, la playlist de Riff Valley debe tener un usuario asignado.',
      );
    }

    await this.contentsService.create({
      name: riffValleyPlaylist.name,
      type: ContentType.RIFF_VALLEY_PLAYLIST,
      authorId: riffValleyPlaylist.user.id,
      riffValleyPlaylistId: riffValleyPlaylist.id,
      backlog: true,
    } as any);

    return this.findOne(id);
  }
}
