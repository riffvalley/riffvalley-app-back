import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DataSource,
  FindOperator,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Asignation } from '../asignations/entities/asignations.entity';
import { UpdateListDto } from '../dto/update-list.dto';
import { List, ListType } from '../entities/list.entity';
import { ListsService } from '../list.service';
import { ListCalendarService } from '../application/list-calendar.service';
import { ListCrudService } from '../application/list-crud.service';
import { ListContentCoordinator } from '../application/list-content-coordinator.service';
import { WeeklyListPublisherService } from '../wordpress/weekly-list-publisher.service';
import { MonthlyListPublisherService } from '../wordpress/monthly-list-publisher.service';

type Row = Pick<List, 'closeDate' | 'releaseDate' | 'listDate'>;
type CalendarWhere =
  | FindOptionsWhere<List>
  | FindOptionsWhere<List>[]
  | undefined;
type CalendarRepository = jest.Mocked<Pick<Repository<List>, 'find'>>;

function matches(where: CalendarWhere, row: Row): boolean {
  const conditions =
    where == null ? [{}] : Array.isArray(where) ? where : [where];
  return conditions.some((condition) => {
    const matchesDate = (
      value: Date | null | undefined,
      expected: Date | FindOperator<unknown> | null | undefined,
    ) => {
      if (expected === undefined) return true;
      if (!(expected instanceof FindOperator)) return value === expected;
      switch (expected.type) {
        case 'isNull':
          return value === null;
        case 'moreThanOrEqual':
          return value != null && value >= expected.value;
        case 'lessThan':
          return value != null && value < expected.value;
        case 'between': {
          if (!Array.isArray(expected.value)) return false;
          const [start, end] = expected.value;
          if (!(start instanceof Date) || !(end instanceof Date)) return false;
          return value != null && value >= start && value <= end;
        }
        default:
          throw new Error(`Operador no soportado: ${expected.type}`);
      }
    };
    return (
      matchesDate(row.closeDate, condition.closeDate) &&
      matchesDate(row.releaseDate, condition.releaseDate) &&
      matchesDate(row.listDate, condition.listDate)
    );
  });
}

describe('ListsService calendar facade', () => {
  const makeList = (row: Row): List =>
    Object.assign(new List(), {
      id: 'list-id',
      name: 'List',
      type: ListType.WEEK,
      asignations: [],
      ...row,
    });
  const radar = makeList({
    listDate: new Date(2026, 8, 18),
    releaseDate: new Date(2026, 8, 19),
    closeDate: new Date(2026, 8, 20),
  });
  const legacyRadar = makeList({ ...radar, closeDate: null });
  const september = makeList({
    listDate: new Date(2026, 8, 15),
    releaseDate: null,
    closeDate: null,
  });

  let rows: List[];
  let service: ListsService;

  beforeEach(async () => {
    rows = [];
    const repository: CalendarRepository = {
      find: jest.fn(async ({ where }) =>
        rows.filter((row) => matches(where, row)),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        ListsService,
        {
          provide: ListCalendarService,
          useFactory: (repo: Repository<List>) => new ListCalendarService(repo),
          inject: [getRepositoryToken(List)],
        },
        { provide: getRepositoryToken(List), useValue: repository },
        { provide: ListCrudService, useValue: {} },
        { provide: ListContentCoordinator, useValue: {} },
        { provide: WeeklyListPublisherService, useValue: {} },
        { provide: MonthlyListPublisherService, useValue: {} },
      ],
    }).compile();
    service = module.get(ListsService);
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  const at = (month: number, day: number, hour = 10) =>
    jest.setSystemTime(new Date(2026, month, day, hour));

  it.each([19, 20, 21, 22])(
    'mantiene el radar actual el día %i',
    async (day) => {
      rows = [radar];
      at(8, day);
      expect(await service.findCurrentWeeklyLists()).toHaveLength(1);
      expect(await service.findPastWeeklyListsByMonth(2026, 9)).toHaveLength(0);
    },
  );

  it('pasa el radar a pasadas el miércoles y usa releaseDate como respaldo', async () => {
    rows = [radar, legacyRadar];
    at(8, 23, 0);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(0);
    expect(await service.findPastWeeklyListsByMonth(2026, 9)).toHaveLength(2);
  });

  it('clasifica listas mensuales sin solapar actuales y pasadas', async () => {
    rows = [september];
    at(9, 12);
    expect(await service.findCurrentMonthLists()).toHaveLength(1);
    expect(await service.findPastMonthListsByYear(2026)).toHaveLength(0);
    at(9, 13);
    expect(await service.findCurrentMonthLists()).toHaveLength(0);
    expect(await service.findPastMonthListsByYear(2026)).toHaveLength(1);
  });
});

describe('ListsService business facade', () => {
  const makeFacade = async () => {
    const crud = {
      create: jest.fn<
        Promise<unknown>,
        Parameters<ListCrudService['create']>
      >(),
      findAll: jest.fn<
        Promise<unknown>,
        Parameters<ListCrudService['findAll']>
      >(),
      findOne: jest.fn<
        Promise<unknown>,
        Parameters<ListCrudService['findOne']>
      >(),
      createVideoList: jest.fn<
        Promise<unknown>,
        Parameters<ListCrudService['createVideoList']>
      >(),
      createWeeklyList: jest.fn<
        Promise<unknown>,
        Parameters<ListCrudService['createWeeklyList']>
      >(),
      createMonthlyList: jest.fn<
        Promise<unknown>,
        Parameters<ListCrudService['createMonthlyList']>
      >(),
    };
    const coordinator = {
      update: jest.fn<
        Promise<unknown>,
        Parameters<ListContentCoordinator['update']>
      >(),
      removeList: jest.fn<
        Promise<unknown>,
        Parameters<ListContentCoordinator['removeList']>
      >(),
    };
    const weekly = {
      generateWordPressPosts: jest.fn<
        Promise<unknown>,
        Parameters<WeeklyListPublisherService['generateWordPressPosts']>
      >(),
      syncDiscToWeeklyPost: jest.fn<
        Promise<unknown>,
        Parameters<WeeklyListPublisherService['syncDiscToWeeklyPost']>
      >(),
    };
    const monthly = {
      generateBestDiscsWordPressPost: jest.fn<
        Promise<unknown>,
        Parameters<
          MonthlyListPublisherService['generateBestDiscsWordPressPost']
        >
      >(),
      syncDiscToMonthlyPost: jest.fn<
        Promise<unknown>,
        Parameters<MonthlyListPublisherService['syncDiscToMonthlyPost']>
      >(),
    };
    crud.findOne.mockResolvedValue(
      Object.assign(new List(), { asignations: [] }),
    );
    const module = await Test.createTestingModule({
      providers: [
        ListsService,
        { provide: ListCrudService, useValue: crud },
        { provide: ListCalendarService, useValue: {} },
        { provide: ListContentCoordinator, useValue: coordinator },
        { provide: WeeklyListPublisherService, useValue: weekly },
        { provide: MonthlyListPublisherService, useValue: monthly },
      ],
    }).compile();
    return {
      facade: module.get(ListsService),
      crud,
      coordinator,
      weekly,
      monthly,
    };
  };

  it('delegates update and remove with the original arguments', async () => {
    const { facade, coordinator } = await makeFacade();
    coordinator.update.mockResolvedValue('updated');
    coordinator.removeList.mockResolvedValue('removed');
    const update: UpdateListDto = { closeDate: null };
    const manager = new DataSource({ type: 'postgres' }).manager;

    await expect(facade.update('list-id', update)).resolves.toBe('updated');
    await expect(facade.removeList('list-id', manager)).resolves.toBe(
      'removed',
    );

    expect(coordinator.update).toHaveBeenCalledWith('list-id', update);
    expect(coordinator.removeList).toHaveBeenCalledWith('list-id', manager);
  });

  it('routes WordPress operations through the existing publisher by list type', async () => {
    const { facade, crud, weekly, monthly } = await makeFacade();
    const assignment = Object.assign(new Asignation(), {
      id: 'assignment-id',
      disc: Object.assign(new Disc(), { id: 'disc-id' }),
    });
    crud.findOne.mockResolvedValue(
      Object.assign(new List(), {
        type: ListType.WEEK,
        asignations: [assignment],
      }),
    );
    weekly.syncDiscToWeeklyPost.mockResolvedValue({ synced: true });
    monthly.syncDiscToMonthlyPost.mockResolvedValue({ synced: true });
    await expect(
      facade.syncDiscToWordPress('list-id', 'assignment-id'),
    ).resolves.toEqual({ synced: true });
    expect(weekly.syncDiscToWeeklyPost).toHaveBeenCalledWith(
      expect.objectContaining({ type: ListType.WEEK }),
      assignment,
    );
    expect(monthly.syncDiscToMonthlyPost).not.toHaveBeenCalled();

    crud.findOne.mockResolvedValue(
      Object.assign(new List(), {
        type: ListType.MONTH,
        asignations: [assignment],
      }),
    );
    await facade.syncDiscToWordPress('list-id', 'assignment-id');
    expect(monthly.syncDiscToMonthlyPost).toHaveBeenCalledWith(
      expect.objectContaining({ type: ListType.MONTH }),
      assignment,
    );
  });

  it('returns the existing no-op result when no matching assignment exists', async () => {
    const { facade, weekly, monthly } = await makeFacade();
    await expect(
      facade.syncDiscToWordPress('list-id', 'missing'),
    ).resolves.toEqual({ synced: false });
    expect(weekly.syncDiscToWeeklyPost).not.toHaveBeenCalled();
    expect(monthly.syncDiscToMonthlyPost).not.toHaveBeenCalled();
  });
});
