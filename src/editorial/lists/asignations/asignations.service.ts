import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateAsignationDto } from './dto/create-asignations.dto';
import { UpdateAsignationDto } from './dto/update-asignations.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { Asignation } from './entities/asignations.entity';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';
import { List, ListType } from 'src/editorial/lists/entities/list.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { ListsService } from 'src/editorial/lists/list.service';
import sanitizeHtml = require('sanitize-html');

const MAX_RADAR_DISCS_PER_GROUP = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const ASIGNATION_RELATION_FOREIGN_KEYS = new Set([
  'FK_9d41fe509640ba0c786b5daf75d', // asignation.userId -> users.id
  'FK_d9e53d3460644eb1f381733ce82', // asignation.discId -> disc.id
  'FK_0f26ccdd372668431e245de0f3e', // asignation.listId -> list.id
]);

// El campo "description" ahora puede llevar el HTML del editor WYSIWYG del
// front (negrita, cursiva, enlaces, párrafos). Se sanea aquí, al entrar,
// porque ese texto termina publicado tal cual en los posts de WordPress.
const DESCRIPTION_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'strong', 'em', 'b', 'i', 'a', 'br'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
};

// "Bandas similares" es texto plano (un listado de nombres separados por
// comas): no admite ninguna etiqueta, se limpia cualquier HTML.
const PLAIN_TEXT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

@Injectable()
export class AsignationsService {
  private readonly logger = new Logger('AsignationsService');

  constructor(
    @InjectRepository(Asignation)
    private readonly asignationRepository: Repository<Asignation>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,

    @InjectRepository(List)
    private readonly listRepository: Repository<List>,

    private readonly listsService: ListsService,

    // private readonly discRespository: Repository<Disc>,
  ) {}

  async create(createAsignationDto: CreateAsignationDto) {
    const {
      userId,
      discId,
      listId,
      description,
      similarBands,
      genre,
      spotifyTrackId,
      ...rest
    } = createAsignationDto;

    try {
      const list = await this.listRepository.findOneBy({ id: listId });
      if (!list)
        throw new NotFoundException(`List with id ${listId} not found`);

      let user: User | undefined = undefined;
      if (userId) {
        user = await this.userRepository.findOneBy({ id: userId });
        if (!user)
          throw new NotFoundException(`User with id ${userId} not found`);
      }

      let disc: Disc | undefined = undefined;
      if (discId) {
        disc = await this.discRepository.findOneBy({ id: discId });
        if (!disc)
          throw new NotFoundException(`Disc with id ${discId} not found`);
      }

      const asignation = this.asignationRepository.create({
        ...rest,
        description:
          description !== undefined
            ? sanitizeHtml(description, DESCRIPTION_SANITIZE_OPTIONS)
            : undefined,
        similarBands:
          similarBands !== undefined
            ? sanitizeHtml(similarBands, PLAIN_TEXT_SANITIZE_OPTIONS)
            : undefined,
        genre:
          genre !== undefined
            ? sanitizeHtml(genre, PLAIN_TEXT_SANITIZE_OPTIONS)
            : undefined,
        spotifyTrackId: spotifyTrackId || null,
        user: user || null,
        disc: disc || null,
        list,
      });

      await this.asignationRepository.manager.transaction(async (manager) => {
        await this.lockListType(manager, listId);
        const transactionalList = await manager
          .getRepository(List)
          .findOneBy({ id: listId });
        if (!transactionalList)
          throw new NotFoundException(`List with id ${listId} not found`);
        asignation.list = transactionalList;

        if (
          disc &&
          transactionalList.type === ListType.WEEK &&
          asignation.position != null &&
          asignation.position !== 0
        ) {
          await this.lockRadarGroup(manager, listId, asignation.position);
          const count = await this.countDiscsInGroup(
            manager.getRepository(Asignation),
            listId,
            asignation.position,
          );
          this.assertRadarGroupCapacity(count);
        }
        await manager.getRepository(Asignation).save(asignation);
      });

      return asignation;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const [asignations, totalItems] =
      await this.asignationRepository.findAndCount({
        order: { id: 'ASC' },
        take: limit,
        skip: offset,
      });

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: asignations,
    };
  }

  async findOne(id: string): Promise<Asignation> {
    const asignation = await this.asignationRepository.findOneBy({ id });
    if (!asignation)
      throw new NotFoundException(`Asignation with id ${id} not found`);
    return asignation;
  }

  async update(id: string, updateAsignationDto: UpdateAsignationDto) {
    // Sacamos genreId aparte
    const {
      userId,
      description,
      similarBands,
      genre,
      spotifyTrackId,
      ...restDto
    } = updateAsignationDto;

    try {
      const asignation = await this.asignationRepository.manager.transaction(
        async (manager) => {
          const asignationRepo = manager.getRepository(Asignation);
          const existing = await asignationRepo.findOne({
            where: { id },
            relations: ['list', 'disc'],
            lock: { mode: 'pessimistic_write', tables: ['asignation'] },
          });

          if (!existing)
            throw new NotFoundException(`Asignation with id ${id} not found`);

          const targetListId = restDto.listId ?? existing.list.id;
          for (const listId of [
            ...new Set([existing.list.id, targetListId]),
          ].sort()) {
            await this.lockListType(manager, listId);
          }
          const currentList = await manager
            .getRepository(List)
            .findOneBy({ id: existing.list.id });
          const targetList = await manager
            .getRepository(List)
            .findOneBy({ id: targetListId });
          if (!currentList)
            throw new NotFoundException(
              `List with id ${existing.list.id} not found`,
            );
          if (!targetList)
            throw new NotFoundException(
              `List with id ${targetListId} not found`,
            );

          const targetPosition =
            restDto.position !== undefined
              ? restDto.position
              : existing.position;
          const hasDisc = restDto.discId
            ? true
            : restDto.discId === null
              ? false
              : !!existing.disc;
          const isTargetRadarGroup =
            targetList.type === ListType.WEEK &&
            targetPosition != null &&
            targetPosition !== 0 &&
            hasDisc;
          const isAlreadyInTargetGroup =
            existing.list.id === targetListId &&
            existing.position === targetPosition &&
            !!existing.disc;

          if (isTargetRadarGroup && !isAlreadyInTargetGroup) {
            const groups = [
              ...(currentList.type === ListType.WEEK &&
              existing.position != null &&
              existing.position !== 0 &&
              existing.disc
                ? [{ listId: existing.list.id, position: existing.position }]
                : []),
              { listId: targetListId, position: targetPosition },
            ];
            const uniqueGroups = Array.from(
              new Map(
                groups.map((group) => [
                  `${group.listId}:${group.position}`,
                  group,
                ]),
              ).values(),
            ).sort((a, b) =>
              `${a.listId}:${a.position}`.localeCompare(
                `${b.listId}:${b.position}`,
              ),
            );
            for (const group of uniqueGroups) {
              await this.lockRadarGroup(manager, group.listId, group.position);
            }

            const count = await this.countDiscsInGroup(
              asignationRepo,
              targetListId,
              targetPosition,
            );
            this.assertRadarGroupCapacity(
              count - (isAlreadyInTargetGroup ? 1 : 0),
            );
          }

          const nextAsignation = await asignationRepo.preload({
            id,
            ...restDto,
            ...(userId ? { user: { id: userId } } : {}),
            ...(description !== undefined
              ? {
                  description: sanitizeHtml(
                    description,
                    DESCRIPTION_SANITIZE_OPTIONS,
                  ),
                }
              : {}),
            ...(similarBands !== undefined
              ? {
                  similarBands: sanitizeHtml(
                    similarBands,
                    PLAIN_TEXT_SANITIZE_OPTIONS,
                  ),
                }
              : {}),
            ...(genre !== undefined
              ? { genre: sanitizeHtml(genre, PLAIN_TEXT_SANITIZE_OPTIONS) }
              : {}),
            ...(spotifyTrackId !== undefined
              ? { spotifyTrackId: spotifyTrackId || null }
              : {}),
          });

          if (!nextAsignation)
            throw new NotFoundException(`Asignation with id ${id} not found`);

          await asignationRepo.save(nextAsignation);
          return nextAsignation;
        },
      );

      // Si se ha tocado el texto, las bandas similares o la canción, y
      // esta asignación pertenece a una lista mensual que ya tiene post en
      // WordPress, empujamos el cambio al momento en vez de esperar a que
      // alguien pulse "generar/actualizar" para toda la lista.
      if (
        description !== undefined ||
        similarBands !== undefined ||
        genre !== undefined ||
        spotifyTrackId !== undefined
      ) {
        const withList = await this.asignationRepository.findOne({
          where: { id },
          relations: ['list'],
        });

        if (withList?.list) {
          await this.listsService.syncDiscToWordPress(withList.list.id, id);
        }
      }

      return asignation;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  private async lockRadarGroup(
    manager: EntityManager,
    listId: string,
    position: number,
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`riffvalley:radar-group:${listId}:${position}`],
    );
  }

  private async lockListType(
    manager: EntityManager,
    listId: string,
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))',
      [`riffvalley:list-type:${listId}`],
    );
  }

  private async countDiscsInGroup(
    repository: Repository<Asignation>,
    listId: string,
    position: number,
  ): Promise<number> {
    const rows: unknown = await repository.query(
      'SELECT COUNT(*)::int AS count FROM asignation WHERE "listId" = $1 AND position = $2 AND "discId" IS NOT NULL',
      [listId, position],
    );
    const [row] = Array.isArray(rows) ? rows : [];
    const count = isRecord(row) ? row.count : undefined;
    return typeof count === 'number' || typeof count === 'string'
      ? Number(count)
      : 0;
  }

  private assertRadarGroupCapacity(existingDiscs: number): void {
    if (existingDiscs >= MAX_RADAR_DISCS_PER_GROUP) {
      throw new BadRequestException(
        'Un grupo de Radar admite como máximo cuatro discos.',
      );
    }
  }

  async remove(id: string) {
    const result = await this.asignationRepository.delete({ id });
    if (result.affected === 0) {
      throw new NotFoundException(`Asignation with id ${id} not found`);
    }
    return { message: `Asignation with id ${id} has been removed` };
  }

  private handleDbExceptions(error: unknown): never {
    if (error instanceof HttpException) throw error;

    if (this.isUniqueViolation(error)) {
      throw new BadRequestException('Asignation conflicts with existing data');
    }

    if (this.isAsignationRelationForeignKeyViolation(error)) {
      throw new NotFoundException(
        'One or more referenced resources were not found',
      );
    }

    this.logger.error(error);
    throw error;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;

    const driverError: unknown = error.driverError;
    if (!isRecord(driverError)) return false;
    return driverError.code === '23505' && driverError.table === 'asignation';
  }

  private isAsignationRelationForeignKeyViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;

    const driverError: unknown = error.driverError;
    if (!isRecord(driverError)) return false;

    return (
      driverError.code === '23503' &&
      driverError.table === 'asignation' &&
      typeof driverError.constraint === 'string' &&
      ASIGNATION_RELATION_FOREIGN_KEYS.has(driverError.constraint)
    );
  }

  async findByListId(listId: string, paginationDto: PaginationDto) {
    const { limit = 100, offset = 0 } = paginationDto;

    const [asignations, totalItems] =
      await this.asignationRepository.findAndCount({
        where: { list: { id: listId } }, // Filtra por listId en la relación
        order: {
          user: { username: 'ASC' }, // Ajustar columna de tu User
          id: 'ASC',
        },
        take: limit, // Límite de resultados
        skip: offset, // Desplazamiento
      });

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      totalItems,
      totalPages,
      currentPage,
      limit,
      data: asignations,
    };
  }
}
