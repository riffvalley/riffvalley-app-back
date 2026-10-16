import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UpdateContentDto } from '../dto/update-content.dto';
import { Content, ContentType } from '../entities/content.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { ListsService } from 'src/editorial/lists/list.service';
import { List } from 'src/editorial/lists/entities/list.entity';
import { isValidDateValue } from 'src/editorial/lists/domain/list-date-rules';
import { ContentQueryService } from './content-query.service';

@Injectable()
export class ContentLifecycleService {
  constructor(
    @InjectRepository(Content)
    private readonly contentRepo: Repository<Content>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Reunion)
    private readonly reunionRepo: Repository<Reunion>,
    @InjectRepository(List)
    private readonly listRepo: Repository<List>,
    @Inject(forwardRef(() => ListsService))
    private readonly listsService: ListsService,
    private readonly contentQueryService: ContentQueryService,
  ) {}

  async update(
    id: string,
    updateContentDto: UpdateContentDto,
  ): Promise<Content> {
    const content = await this.contentQueryService.findOne(id);

    const {
      authorId,
      publicationDate,
      closeDate,
      listDate,
      reunionId,
      ...rest
    } = updateContentDto;

    // Update author if provided
    if (authorId !== undefined) {
      const author = await this.userRepo.findOne({ where: { id: authorId } });
      if (!author) {
        throw new NotFoundException(`User with id ${authorId} not found`);
      }
      content.author = author;
    }

    // Update reunion if provided
    if (reunionId !== undefined) {
      if (reunionId === null) {
        content.reunionId = null;
      } else {
        const reunion = await this.reunionRepo.findOne({
          where: { id: reunionId },
        });
        if (!reunion) {
          throw new NotFoundException(`Reunion with id ${reunionId} not found`);
        }
        content.reunionId = reunionId;
      }
    }

    // Update other fields
    Object.assign(content, rest);

    if (publicationDate !== undefined) {
      // RADAR/BEST and REUNION cannot have publicationDate removed.
      if (
        !isValidDateValue(publicationDate) &&
        (content.type === ContentType.RADAR ||
          content.type === ContentType.BEST ||
          content.type === ContentType.REUNION)
      ) {
        throw new BadRequestException(
          `El tipo ${content.type} requiere una fecha de publicación.`,
        );
      }

      if ((publicationDate as unknown) instanceof Date) {
        content.publicationDate = publicationDate as unknown as Date;
        content.ready = false;
      } else {
        const newDate =
          publicationDate &&
          typeof publicationDate === 'string' &&
          publicationDate.trim() !== ''
            ? new Date(publicationDate)
            : null;
        content.publicationDate = newDate;
        if (newDate) {
          content.ready = false;
        }
      }
    }

    if (
      (publicationDate !== undefined || rest.type !== undefined) &&
      (content.type === ContentType.RADAR ||
        content.type === ContentType.BEST ||
        content.type === ContentType.REUNION) &&
      !isValidDateValue(content.publicationDate)
    ) {
      throw new BadRequestException(
        `El tipo ${content.type} requiere una fecha de publicación.`,
      );
    }

    if (closeDate !== undefined) {
      if ((closeDate as unknown) instanceof Date) {
        content.closeDate = closeDate as unknown as Date;
      } else {
        content.closeDate =
          closeDate && typeof closeDate === 'string' && closeDate.trim() !== ''
            ? new Date(closeDate)
            : null;
      }
    }

    if (listDate !== undefined) {
      if ((listDate as unknown) instanceof Date) {
        content.listDate = listDate as unknown as Date;
      } else {
        content.listDate =
          listDate && typeof listDate === 'string' && listDate.trim() !== ''
            ? new Date(listDate)
            : null;
      }
    }

    const canSyncList =
      content.list &&
      (content.type === ContentType.RADAR ||
        content.type === ContentType.BEST ||
        content.type === ContentType.VIDEO);
    const dateSyncRequested =
      publicationDate !== undefined ||
      closeDate !== undefined ||
      listDate !== undefined;
    const listSyncNeeded =
      canSyncList &&
      dateSyncRequested &&
      ((publicationDate !== undefined &&
        !this.dateValuesMatch(
          content.publicationDate,
          content.list.releaseDate,
        )) ||
        (closeDate !== undefined &&
          !this.dateValuesMatch(content.closeDate, content.list.closeDate)) ||
        (listDate !== undefined &&
          !this.dateValuesMatch(content.listDate, content.list.listDate)));

    const reunionSyncNeeded =
      content.type === ContentType.REUNION || Boolean(content.reunionId);
    const persistUpdate = async (manager?: EntityManager): Promise<Content> => {
      const contentRepo = manager
        ? manager.getRepository(Content)
        : this.contentRepo;
      const saved = await contentRepo.save(content);

      if (listSyncNeeded) {
        const listRepo = manager ? manager.getRepository(List) : this.listRepo;
        const list = await listRepo.findOne({
          where: { id: content.list.id },
        });

        if (!list) {
          throw new NotFoundException(
            `List with id ${content.list.id} not found`,
          );
        }

        let listChanged = false;
        if (publicationDate !== undefined) {
          listChanged =
            this.assignDateIfChanged(
              list,
              'releaseDate',
              saved.publicationDate,
            ) || listChanged;
        }
        if (closeDate !== undefined) {
          listChanged =
            this.assignDateIfChanged(list, 'closeDate', saved.closeDate) ||
            listChanged;
        }
        if (listDate !== undefined) {
          listChanged =
            this.assignDateIfChanged(list, 'listDate', saved.listDate) ||
            listChanged;
        }

        if (listChanged) await listRepo.save(list);
        saved.list = list;
      }

      // NOTE: RiffValleyPlaylist/Article/Video status remains independent.
      if (saved.type === ContentType.REUNION || saved.reunionId) {
        // Ensure we have the relation loaded or use reunionId
        let reunionIdToUpdate = saved.reunionId;

        if (!reunionIdToUpdate && saved.reunion) {
          reunionIdToUpdate = saved.reunion.id;
        }

        // If we don't have id but know it should exist, fetch its relation.
        if (!reunionIdToUpdate && saved.type === ContentType.REUNION) {
          const contentWithReunion = await contentRepo.findOne({
            where: { id: saved.id },
            relations: ['reunion'],
          });
          if (contentWithReunion && contentWithReunion.reunion) {
            reunionIdToUpdate = contentWithReunion.reunion.id;
          }
        }

        if (reunionIdToUpdate && (saved.publicationDate || saved.name)) {
          const reunionRepo = manager
            ? manager.getRepository(Reunion)
            : this.reunionRepo;
          const reunionEntity = await reunionRepo.findOne({
            where: { id: reunionIdToUpdate },
          });

          if (reunionEntity) {
            let reunionChanged = false;

            if (saved.publicationDate) {
              const contentDate = new Date(saved.publicationDate);
              const reunionDate = reunionEntity.fecha
                ? new Date(reunionEntity.fecha)
                : null;

              if (
                !reunionDate ||
                reunionDate.getTime() !== contentDate.getTime()
              ) {
                reunionEntity.fecha = contentDate;
                reunionChanged = true;
              }
            }

            if (saved.name && reunionEntity.titulo !== saved.name) {
              reunionEntity.titulo = saved.name;
              reunionChanged = true;
            }

            if (reunionChanged) {
              await reunionRepo.save(reunionEntity);
            }
          }
        }
      }

      return saved;
    };

    if (listSyncNeeded || reunionSyncNeeded) {
      return this.contentRepo.manager.transaction((manager) =>
        persistUpdate(manager),
      );
    }

    return persistUpdate();
  }

  async remove(id: string): Promise<void> {
    const content = await this.contentRepo.findOne({
      where: { id },
      relations: ['list', 'reunion', 'riffValleyPlaylist', 'article', 'video'],
    });

    if (!content) {
      throw new NotFoundException(`Content with id ${id} not found`);
    }

    const listId = content.list?.id;

    if (listId || content.reunion) {
      await this.contentRepo.manager.transaction(async (manager) => {
        await manager.getRepository(Content).remove(content);
        if (listId) await this.listsService.removeList(listId, manager);
        if (content.reunion) {
          await manager.getRepository(Reunion).delete(content.reunion.id);
        }
      });
    } else {
      await this.contentRepo.remove(content);
    }

    // NOTE: The linked RiffValleyPlaylist/Article/Video entity is left untouched — its
    // status is no longer auto-reset on Content removal. Video/Article/RiffValleyPlaylist
    // and Content are fully independent now.
  }

  private assignDateIfChanged<T extends object>(
    target: T,
    field: keyof T,
    source: Date | null | undefined,
  ): boolean {
    const current = target[field] as Date | null | undefined;
    const next = source == null ? null : new Date(source);
    const currentTime = current == null ? null : new Date(current).getTime();
    const nextTime = next == null ? null : next.getTime();

    if (currentTime === nextTime) return false;

    target[field] = next as T[keyof T];
    return true;
  }

  private dateValuesMatch(
    left: Date | null | undefined,
    right: Date | null | undefined,
  ): boolean {
    const leftTime = left == null ? null : new Date(left).getTime();
    const rightTime = right == null ? null : new Date(right).getTime();
    return leftTime === rightTime;
  }
}
