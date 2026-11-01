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
import { ContentCalendarEventPublisher } from '../realtime/content-calendar-event-publisher.service';

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
    private readonly eventPublisher: ContentCalendarEventPublisher,
  ) {}

  async update(
    id: string,
    updateContentDto: UpdateContentDto,
  ): Promise<Content> {
    const content = await this.contentQueryService.findOne(id);
    const originalCalendarState = this.getCalendarState(content);

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
      const publicationDateInput: unknown = publicationDate;
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

      if (publicationDateInput instanceof Date) {
        content.publicationDate = publicationDateInput;
        content.ready = false;
      } else {
        const newDate =
          publicationDateInput &&
          typeof publicationDateInput === 'string' &&
          publicationDateInput.trim() !== ''
            ? new Date(publicationDateInput)
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
      const closeDateInput: unknown = closeDate;
      if (closeDateInput instanceof Date) {
        content.closeDate = closeDateInput;
      } else {
        content.closeDate =
          closeDateInput &&
          typeof closeDateInput === 'string' &&
          closeDateInput.trim() !== ''
            ? new Date(closeDateInput)
            : null;
      }
    }

    if (listDate !== undefined) {
      const listDateInput: unknown = listDate;
      if (listDateInput instanceof Date) {
        content.listDate = listDateInput;
      } else {
        content.listDate =
          listDateInput &&
          typeof listDateInput === 'string' &&
          listDateInput.trim() !== ''
            ? new Date(listDateInput)
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
              list.releaseDate,
              saved.publicationDate,
              (date) => (list.releaseDate = date),
            ) || listChanged;
        }
        if (closeDate !== undefined) {
          listChanged =
            this.assignDateIfChanged(
              list.closeDate,
              saved.closeDate,
              (date) => (list.closeDate = date),
            ) || listChanged;
        }
        if (listDate !== undefined) {
          listChanged =
            this.assignDateIfChanged(
              list.listDate,
              saved.listDate,
              (date) => (list.listDate = date),
            ) || listChanged;
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

    const saved =
      listSyncNeeded || reunionSyncNeeded
        ? await this.contentRepo.manager.transaction((manager) =>
            persistUpdate(manager),
          )
        : await persistUpdate();

    if (this.calendarStateChanged(originalCalendarState, saved)) {
      this.eventPublisher.publishInvalidationSafely();
    }
    return saved;
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
        if (listId && content.type !== ContentType.VIDEO) {
          await this.listsService.removeList(listId, manager);
        }
        if (content.reunion) {
          await manager.getRepository(Reunion).delete(content.reunion.id);
        }
      });
    } else {
      await this.contentRepo.remove(content);
    }

    this.eventPublisher.publishInvalidationSafely();

    // NOTE: The linked RiffValleyPlaylist/Article/Video entity is left untouched — its
    // status is no longer auto-reset on Content removal. Video/Article/RiffValleyPlaylist
    // and Content are fully independent now.
  }

  private assignDateIfChanged(
    current: Date | null | undefined,
    source: Date | null | undefined,
    assign: (date: Date | null) => void,
  ): boolean {
    const next = source == null ? null : new Date(source);
    const currentTime = current == null ? null : new Date(current).getTime();
    const nextTime = next == null ? null : next.getTime();

    if (currentTime === nextTime) return false;

    assign(next);
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

  private getCalendarState(content: Content): readonly unknown[] {
    const dateValue = (value: Date | string | null | undefined) =>
      value == null ? null : new Date(value).getTime();

    return [
      content.type,
      content.name,
      content.notes ?? null,
      dateValue(content.publicationDate),
      dateValue(content.closeDate),
      dateValue(content.listDate),
      content.ready,
      content.backlog,
      content.author?.id ?? null,
      content.reunionId ?? content.reunion?.id ?? null,
      content.list?.id ?? null,
      dateValue(content.list?.releaseDate),
      dateValue(content.list?.closeDate),
      dateValue(content.list?.listDate),
    ];
  }

  private calendarStateChanged(
    originalState: readonly unknown[],
    saved: Content,
  ): boolean {
    return originalState.some(
      (value, index) => value !== this.getCalendarState(saved)[index],
    );
  }
}
