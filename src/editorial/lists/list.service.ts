import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { PaginationDto } from 'src/platform/common/dtos/pagination.dto';
import { List, ListType } from './entities/list.entity';
import { ListCalendarService } from './application/list-calendar.service';
import { ListContentCoordinator } from './application/list-content-coordinator.service';
import { ListCrudService } from './application/list-crud.service';
import { WeeklyListPublisherService } from './wordpress/weekly-list-publisher.service';
import { MonthlyListPublisherService } from './wordpress/monthly-list-publisher.service';

export {
  MONTHLY_CLOSE_DAY,
  WEEKLY_CLOSE_GRACE_DAYS,
  getMonthlyReferenceStart,
  getWeeklyOpenCutoff,
} from './application/list-calendar.service';

@Injectable()
export class ListsService {
  constructor(
    private readonly listCrudService: ListCrudService,
    private readonly listCalendarService: ListCalendarService,
    private readonly listContentCoordinator: ListContentCoordinator,
    private readonly weeklyListPublisherService: WeeklyListPublisherService,
    private readonly monthlyListPublisherService: MonthlyListPublisherService,
  ) {}

  create(createListDto: CreateListDto) {
    return this.listCrudService.create(createListDto);
  }

  findAll(paginationDto: PaginationDto) {
    return this.listCrudService.findAll(paginationDto);
  }

  findOne(id: string): Promise<List> {
    return this.listCrudService.findOne(id);
  }

  update(id: string, updateListDto: UpdateListDto) {
    return this.listContentCoordinator.update(id, updateListDto);
  }

  removeList(id: string, manager?: EntityManager) {
    return this.listContentCoordinator.removeList(id, manager);
  }

  findUpcoming() {
    return this.listCalendarService.findUpcoming();
  }

  findNext() {
    return this.listCalendarService.findNext();
  }

  findAllSpecialLists() {
    return this.listCalendarService.findAllSpecialLists();
  }

  findAllVideoLists() {
    return this.listCalendarService.findAllVideoLists();
  }

  findCurrentMonthLists() {
    return this.listCalendarService.findCurrentMonthLists();
  }

  findPastMonthListsByYear(year: number) {
    return this.listCalendarService.findPastMonthListsByYear(year);
  }

  findCurrentWeeklyLists() {
    return this.listCalendarService.findCurrentWeeklyLists();
  }

  findPastWeeklyListsByMonth(year: number, month: number) {
    return this.listCalendarService.findPastWeeklyListsByMonth(year, month);
  }

  findCurrentVideoLists() {
    return this.listCalendarService.findCurrentVideoLists();
  }

  findPastVideoListsByYear(year: number) {
    return this.listCalendarService.findPastVideoListsByYear(year);
  }

  createVideoList(
    releaseDate?: Date,
    listDate?: Date,
    listName?: string,
    closeDate?: Date,
    manager?: EntityManager,
  ) {
    return this.listCrudService.createVideoList(
      releaseDate,
      listDate,
      listName,
      closeDate,
      manager,
    );
  }

  createWeeklyList(
    releaseDate?: Date,
    listDate?: Date,
    closeDate?: Date,
    manager?: EntityManager,
  ) {
    return this.listCrudService.createWeeklyList(
      releaseDate,
      listDate,
      closeDate,
      manager,
    );
  }

  createMonthlyList(
    releaseDate?: Date,
    listDate?: Date,
    closeDate?: Date,
    manager?: EntityManager,
  ) {
    return this.listCrudService.createMonthlyList(
      releaseDate,
      listDate,
      closeDate,
      manager,
    );
  }

  async generateWordPressPosts(listId: string, position?: number) {
    const list = await this.findOne(listId);
    return this.weeklyListPublisherService.generateWordPressPosts(
      list,
      position,
    );
  }

  async syncDiscToWordPress(listId: string, asignationId: string) {
    const list = await this.findOne(listId);
    const asignation = list.asignations.find(
      (item) => item.id === asignationId && item.disc,
    );
    if (!asignation) return { synced: false };

    if (list.type === ListType.MONTH) {
      return this.monthlyListPublisherService.syncDiscToMonthlyPost(
        list,
        asignation,
      );
    }

    if (list.type === ListType.WEEK) {
      return this.weeklyListPublisherService.syncDiscToWeeklyPost(
        list,
        asignation,
      );
    }

    return { synced: false };
  }

  async generateBestDiscsWordPressPost(listId: string) {
    const list = await this.findOne(listId);
    return this.monthlyListPublisherService.generateBestDiscsWordPressPost(
      list,
    );
  }
}
