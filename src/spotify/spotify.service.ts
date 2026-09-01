import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    return this.findOne(savedEntity.id);
  }

  async findAll(params: FindSpotifyParams = {}): Promise<Spotify[]> {
    const { limit = 50, offset = 0, q, status, type, desde, hasta } = params;
    const query = this.repo
      .createQueryBuilder('spotify')
      .leftJoinAndSelect('spotify.user', 'user')
      .leftJoinAndSelect('spotify.content', 'content')
      .loadRelationCountAndMap(
        'spotify.playlistArtistsCount',
        'spotify.playlistArtists',
      )
      .orderBy('spotify.updatedAt', 'DESC')
      .take(Math.min(Math.max(0, limit), 200))
      .skip(Math.max(0, offset));

    if (status) query.andWhere('spotify.status = :status', { status });
    if (Array.isArray(type)) {
      query.andWhere('spotify.type IN (:...types)', { types: type });
    } else if (type) {
      query.andWhere('spotify.type = :type', { type });
    }
    if (desde) {
      query.andWhere('spotify.updateDate >= :desde', {
        desde: new Date(desde),
      });
    }
    if (hasta) {
      query.andWhere('spotify.updateDate <= :hasta', {
        hasta: new Date(hasta),
      });
    }
    if (q) {
      query.andWhere('(spotify.name ILIKE :q OR spotify.link ILIKE :q)', {
        q: `%${q}%`,
      });
    }

    return query.getMany();
  }

  // Elige al azar una de las playlists de género ya curadas y publicadas
  // (mismo criterio que findGenres), para el widget de "playlist aleatoria".
  async findRandomGenrePlaylist(): Promise<Spotify> {
    const entity = await this.repo
      .createQueryBuilder('spotify')
      .where('spotify.type IN (:...types)', {
        types: ['genero', 'especial', 'otras'],
      })
      .andWhere('spotify.status = :status', {
        status: SpotifyStatusEnum.PUBLISHED,
      })
      .andWhere("spotify.link != ''")
      .orderBy('RANDOM()')
      .limit(1)
      .getOne();

    if (!entity) {
      throw new NotFoundException('No hay playlists de género publicadas');
    }

    return entity;
  }

  async findOne(id: string): Promise<Spotify> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: [
        'user',
        'content',
        'playlistArtists',
        'playlistArtists.artist',
      ],
    });
    if (!entity) throw new NotFoundException('Spotify item not found');
    return entity;
  }

  async update(
    id: string,
    updateSpotifyDto: UpdateSpotifyDto,
  ): Promise<Spotify> {
    const entity = await this.findOne(id);

    // Update simple fields
    if (updateSpotifyDto.name) entity.name = updateSpotifyDto.name;
    if (updateSpotifyDto.link) entity.link = updateSpotifyDto.link;
    if (updateSpotifyDto.type) entity.type = updateSpotifyDto.type;
    if (updateSpotifyDto.updateDate) {
      entity.updateDate = new Date(updateSpotifyDto.updateDate);
    }

    // Handle User Assignment
    if (updateSpotifyDto.userId) {
      entity.user = { id: updateSpotifyDto.userId } as any;
    }

    // Logic for State Transitions
    // NOTE: this no longer touches Content — Spotify and Content are fully
    // independent. Creating/linking a Content is a manual, explicit action
    // (see createContentForSpotify() / POST /spotify/:id/content).
    if (updateSpotifyDto.status && updateSpotifyDto.status !== entity.status) {
      if (updateSpotifyDto.status === SpotifyStatusEnum.READY) {
        if (!entity.user) {
          throw new BadRequestException(
            `Para cambiar el estado a "${updateSpotifyDto.status}", el Spotify debe tener un usuario asignado.`,
          );
        }
      } else if (updateSpotifyDto.status === SpotifyStatusEnum.PUBLISHED) {
        if (!updateSpotifyDto.updateDate) {
          throw new BadRequestException(
            'Para cambiar el estado a "published", debe proporcionar una fecha (updateDate).',
          );
        }
        entity.updateDate = new Date(updateSpotifyDto.updateDate);
      }
    }

    // Apply state change
    if (updateSpotifyDto.status) entity.status = updateSpotifyDto.status;

    await this.repo.save(entity);

    // Return the full entity
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const entity = await this.findOne(id);

    const content = await this.contentsService.findOneBySpotifyId(id);
    if (content) {
      throw new BadRequestException(
        'No se puede eliminar un Spotify que tiene un Content asociado. Elimina primero ese Content (DELETE /contents/:id).',
      );
    }

    await this.repo.remove(entity);
    return { ok: true };
  }

  /**
   * Manual "create content" button: creates a backlog Content (no
   * publicationDate) linked to this Spotify item and stops there — Spotify
   * and Content stay fully independent afterwards, no further sync happens.
   */
  async createContentForSpotify(id: string): Promise<Spotify> {
    const spotify = await this.findOne(id);

    if (spotify.content) {
      throw new BadRequestException(
        'Este Spotify ya tiene un Content asociado.',
      );
    }
    if (!spotify.user) {
      throw new BadRequestException(
        'Para crear el Content asociado, el Spotify debe tener un usuario asignado.',
      );
    }

    await this.contentsService.create({
      name: spotify.name,
      type: ContentType.SPOTIFY,
      authorId: spotify.user.id,
      spotifyId: spotify.id,
      backlog: true,
    } as any);

    return this.findOne(id);
  }
}
