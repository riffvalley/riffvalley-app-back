import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  Content,
  ContentType,
} from 'src/editorial/contents/entities/content.entity';
import { UpdateListDto } from '../dto/update-list.dto';
import { List, ListType } from '../entities/list.entity';
import {
  ContentCalendarEventPublisher,
  createContentCalendarEvent,
} from 'src/editorial/contents/realtime/content-calendar-event-publisher.service';
import {
  CONTENT_CALENDAR_GENERIC_CHANGE,
  CONTENT_CALENDAR_SYSTEM_ACTOR,
  ContentCalendarField,
  ContentCalendarMutationContext,
  contentCalendarCivilDate,
} from 'src/editorial/contents/realtime/contracts/content-calendar-event.contract';
import {
  assertRequiredEditorialDate,
  hasAnyEditorialDate,
  isValidDateValue,
} from '../domain/list-date-rules';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class ListContentCoordinator {
  private readonly logger = new Logger('ListsService');

  constructor(
    @InjectRepository(List)
    private readonly listRepository: Repository<List>,
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
    private readonly eventPublisher: ContentCalendarEventPublisher,
  ) {}

  async update(
    id: string,
    updateListDto: UpdateListDto,
    context?: ContentCalendarMutationContext,
  ) {
    const list = await this.listRepository.preload({
      id,
      ...updateListDto,
    });

    if (!list) throw new NotFoundException(`List with id ${id} not found`);

    this.validateUpdateDateRules(list, updateListDto);

    try {
      const dateFields = ['closeDate', 'releaseDate', 'listDate'] as const;
      const syncRequested = dateFields.some(
        (field) => updateListDto[field] !== undefined,
      );
      const linkedContent = syncRequested
        ? await this.contentRepository.findOne({
            where: { list: { id: list.id } },
          })
        : null;
      if (
        updateListDto.releaseDate === null &&
        (linkedContent?.type === ContentType.RADAR ||
          linkedContent?.type === ContentType.REUNION)
      ) {
        throw new BadRequestException(
          `El tipo ${linkedContent.type} requiere una fecha de publicación.`,
        );
      }
      const contentSyncNeeded =
        !!linkedContent &&
        ((updateListDto.closeDate !== undefined &&
          !this.dateValuesMatch(linkedContent.closeDate, list.closeDate)) ||
          (updateListDto.releaseDate !== undefined &&
            !this.dateValuesMatch(
              linkedContent.publicationDate,
              list.releaseDate,
            )) ||
          (updateListDto.listDate !== undefined &&
            this.listTypeHasSyncedListDate(list.type) &&
            !this.dateValuesMatch(linkedContent.listDate, list.listDate)));
      const previousPublicationDate = linkedContent?.publicationDate;

      if (!contentSyncNeeded) {
        if (updateListDto.type !== undefined) {
          return this.listRepository.manager.transaction(async (manager) => {
            const currentList = await manager
              .getRepository(List)
              .findOneBy({ id });
            if (!currentList)
              throw new NotFoundException(`List with id ${id} not found`);

            if (currentList.type !== updateListDto.type) {
              await this.lockListTypeForUpdate(manager, id);
            }

            const transactionalList = await manager
              .getRepository(List)
              .preload({ id, ...updateListDto });
            if (!transactionalList)
              throw new NotFoundException(`List with id ${id} not found`);

            if (
              currentList.type !== ListType.WEEK &&
              transactionalList.type === ListType.WEEK
            ) {
              await this.assertRadarGroupsWithinLimit(manager, id);
            }

            return manager.getRepository(List).save(transactionalList);
          });
        }
        await this.listRepository.save(list);
        return list;
      }

      const result = await this.listRepository.manager.transaction(
        async (manager) => {
          let contentChanged = false;
          const changedFields = new Set<ContentCalendarField>();
          const listRepo = manager.getRepository(List);
          const contentRepo = manager.getRepository(Content);
          const currentList = updateListDto.type
            ? await listRepo.findOneBy({ id })
            : null;
          if (updateListDto.type && !currentList) {
            throw new NotFoundException(`List with id ${id} not found`);
          }
          if (
            currentList &&
            updateListDto.type !== undefined &&
            currentList.type !== updateListDto.type
          ) {
            await this.lockListTypeForUpdate(manager, id);
          }
          const transactionalList = await listRepo.preload({
            id,
            ...updateListDto,
          });

          if (!transactionalList) {
            throw new NotFoundException(`List with id ${id} not found`);
          }

          if (
            currentList &&
            currentList.type !== ListType.WEEK &&
            transactionalList.type === ListType.WEEK
          ) {
            await this.assertRadarGroupsWithinLimit(manager, id);
          }

          await listRepo.save(transactionalList);
          const content = await contentRepo.findOne({
            where: { list: { id: transactionalList.id } },
          });

          if (content) {
            if (updateListDto.closeDate !== undefined) {
              if (
                contentCalendarCivilDate(content.closeDate) !==
                contentCalendarCivilDate(transactionalList.closeDate)
              ) {
                changedFields.add('closeDate');
              }
              contentChanged =
                this.assignDateIfChanged(
                  content.closeDate,
                  transactionalList.closeDate,
                  (date) => (content.closeDate = date),
                ) || contentChanged;
            }
            if (updateListDto.releaseDate !== undefined) {
              if (
                contentCalendarCivilDate(content.publicationDate) !==
                contentCalendarCivilDate(transactionalList.releaseDate)
              ) {
                changedFields.add('publicationDate');
              }
              contentChanged =
                this.assignDateIfChanged(
                  content.publicationDate,
                  transactionalList.releaseDate,
                  (date) => (content.publicationDate = date),
                ) || contentChanged;
            }
            if (
              updateListDto.listDate !== undefined &&
              this.listTypeHasSyncedListDate(transactionalList.type)
            ) {
              if (
                contentCalendarCivilDate(content.listDate) !==
                contentCalendarCivilDate(transactionalList.listDate)
              ) {
                changedFields.add('listDate');
              }
              contentChanged =
                this.assignDateIfChanged(
                  content.listDate,
                  transactionalList.listDate,
                  (date) => (content.listDate = date),
                ) || contentChanged;
            }

            if (contentChanged) {
              await contentRepo.save(content);
              this.logger.log(`Updated content ${content.id} from list sync`);
            }
          }

          return {
            list: transactionalList,
            contentChanged,
            content,
            changedFields: [...changedFields],
          };
        },
      );
      if (
        result.contentChanged &&
        result.content &&
        result.changedFields.length > 0
      ) {
        const mutation = context ?? { actor: CONTENT_CALENDAR_SYSTEM_ACTOR };
        const previousDate = contentCalendarCivilDate(previousPublicationDate);
        const newDate = contentCalendarCivilDate(
          result.content.publicationDate,
        );
        const action =
          previousDate === null && newDate !== null
            ? 'scheduled'
            : previousDate !== null && newDate === null
              ? 'unscheduled'
              : previousDate !== newDate
                ? 'moved'
                : 'updated';
        this.eventPublisher.publishChangeSafely(
          () =>
            createContentCalendarEvent({
              action,
              content: result.content,
              actor: mutation.actor,
              sourceId: mutation.sourceId,
              previousDate: previousPublicationDate,
              fields: result.changedFields,
            }),
          CONTENT_CALENDAR_GENERIC_CHANGE,
        );
      }
      return result.list;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.handleDbExceptions(error);
    }
  }

  async removeList(
    id: string,
    manager?: EntityManager,
    context?: ContentCalendarMutationContext,
  ) {
    if (manager) {
      const result = await this.removeListWithManager(id, manager);
      return result.list;
    }

    const list = await this.listRepository.findOne({ where: { id } });
    if (!list) {
      throw new NotFoundException(`List with id ${id} not found`);
    }

    const content = await this.contentRepository.findOne({
      where: { list: { id: list.id } },
    });
    if (!content) {
      return this.listRepository.remove(list);
    }

    const result = await this.listRepository.manager.transaction(
      (transactionManager) =>
        this.removeListWithManager(id, transactionManager),
    );
    if (result.contentRemoved) {
      const mutation = context ?? { actor: CONTENT_CALENDAR_SYSTEM_ACTOR };
      this.eventPublisher.publishChangeSafely(
        () =>
          result.removedContent
            ? createContentCalendarEvent({
                action: 'deleted',
                content: result.removedContent,
                actor: mutation.actor,
                sourceId: mutation.sourceId,
                previousDate: result.removedContent.publicationDate,
              })
            : CONTENT_CALENDAR_GENERIC_CHANGE,
        CONTENT_CALENDAR_GENERIC_CHANGE,
      );
    }
    return result.list;
  }

  private async removeListWithManager(id: string, manager: EntityManager) {
    const listRepo = manager.getRepository(List);
    const contentRepo = manager.getRepository(Content);
    const list = await listRepo.findOne({ where: { id } });

    if (!list) {
      throw new NotFoundException(`List with id ${id} not found`);
    }

    const content = await contentRepo.findOne({
      where: { list: { id: list.id } },
    });
    const removedContent = content
      ? {
          id: content.id,
          name: content.name,
          type: content.type,
          publicationDate: content.publicationDate,
        }
      : null;
    if (content) {
      await contentRepo.remove(content);
    }

    const removedList = await listRepo.remove(list);
    return {
      list: removedList,
      contentRemoved: Boolean(content),
      removedContent,
    };
  }

  private async lockListTypeForUpdate(
    manager: EntityManager,
    listId: string,
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`riffvalley:list-type:${listId}`],
    );
  }

  private async assertRadarGroupsWithinLimit(
    manager: EntityManager,
    listId: string,
  ): Promise<void> {
    const overLimit = await manager.query(
      'SELECT position FROM asignation WHERE "listId" = $1 AND position IS NOT NULL AND position <> 0 AND "discId" IS NOT NULL GROUP BY position HAVING COUNT(*) > 4 LIMIT 1',
      [listId],
    );

    if (overLimit?.length) {
      throw new BadRequestException(
        'No se puede convertir en Radar: un grupo ya supera el máximo de cuatro discos.',
      );
    }
  }

  private validateUpdateDateRules(
    list: List,
    updateListDto: UpdateListDto,
  ): void {
    const dateFields = ['listDate', 'releaseDate', 'closeDate'] as const;
    const explicitlyAddsDate = dateFields.some(
      (field) =>
        updateListDto[field] !== undefined && updateListDto[field] !== null,
    );
    const changesTypeToSpecial = updateListDto.type === ListType.SPECIAL;

    if (
      list.type === ListType.SPECIAL &&
      (explicitlyAddsDate ||
        (changesTypeToSpecial && hasAnyEditorialDate(list)))
    ) {
      throw new BadRequestException(
        'Las listas SPECIAL no admiten fechas editoriales.',
      );
    }

    if (list.type === ListType.WEEK || list.type === ListType.MONTH) {
      const releaseDateIsRelevant =
        updateListDto.releaseDate !== undefined ||
        updateListDto.type !== undefined;

      if (releaseDateIsRelevant) {
        assertRequiredEditorialDate(list.type, list.releaseDate);
      }
    }

    if (
      updateListDto.releaseDate !== undefined &&
      updateListDto.releaseDate !== null &&
      !isValidDateValue(updateListDto.releaseDate)
    ) {
      throw new BadRequestException('La fecha de publicación no es válida.');
    }
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

  private listTypeHasSyncedListDate(type: ListType): boolean {
    return (
      type === ListType.WEEK ||
      type === ListType.MONTH ||
      type === ListType.VIDEO
    );
  }

  private handleDbExceptions(error: unknown): never {
    if (isRecord(error) && error.code === '23505') {
      throw new BadRequestException(
        typeof error.detail === 'string' ? error.detail : undefined,
      );
    }
    this.logger.error(error);
    throw new InternalServerErrorException('An unexpected error occurred', {
      cause: error,
    });
  }
}
