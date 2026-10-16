import { FindOperator } from 'typeorm';
import { List, ListType } from '../entities/list.entity';
import { ListsService } from '../list.service';
import { ListCalendarService } from '../application/list-calendar.service';
import { ListCrudService } from '../application/list-crud.service';
import { ListContentCoordinator } from '../application/list-content-coordinator.service';
import { WeeklyListPublisherService } from '../wordpress/weekly-list-publisher.service';
import { MonthlyListPublisherService } from '../wordpress/monthly-list-publisher.service';

type Row = { closeDate: Date | null; releaseDate: Date | null; listDate: Date };

// Evaluate in memory the `where` conditions (array = OR) produced by the service.
function matches(where: any, row: Row): boolean {
  const conditions = Array.isArray(where) ? where : [where];
  return conditions.some((cond: any) =>
    Object.entries(cond).every(([field, expected]) => {
      if (field === 'type') return true;
      const value = (row as any)[field] as Date | null;
      if (!(expected instanceof FindOperator)) return value === expected;
      const op = expected as FindOperator<any>;
      switch (op.type) {
        case 'isNull':
          return value === null;
        case 'moreThanOrEqual':
          return value !== null && value >= op.value;
        case 'lessThan':
          return value !== null && value < op.value;
        case 'between':
          return value !== null && value >= op.value[0] && value <= op.value[1];
        default:
          throw new Error(`Operador no soportado: ${op.type}`);
      }
    }),
  );
}

describe('ListsService calendar facade', () => {
  const radar: Row = {
    listDate: new Date(2026, 8, 18),
    releaseDate: new Date(2026, 8, 19),
    closeDate: new Date(2026, 8, 20),
  };
  const legacyRadar: Row = { ...radar, closeDate: null };
  const september: Row = {
    listDate: new Date(2026, 8, 15),
    releaseDate: null,
    closeDate: null,
  };

  let rows: Row[];
  let service: ListsService;

  beforeEach(() => {
    rows = [];
    const repo = {
      find: jest.fn(async ({ where }) =>
        rows.filter((row) => matches(where, row)),
      ),
    };
    service = new ListsService(
      {} as ListCrudService,
      new ListCalendarService(repo as any),
      {} as ListContentCoordinator,
      {} as WeeklyListPublisherService,
      {} as MonthlyListPublisherService,
    );
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
  const makeFacade = () => {
    const crud = {
      findOne: jest.fn().mockResolvedValue({ asignations: [] }),
    };
    const calendar = {};
    const coordinator = {
      update: jest.fn().mockResolvedValue('updated'),
      removeList: jest.fn().mockResolvedValue('removed'),
    };
    const weekly = {
      generateWordPressPosts: jest.fn().mockResolvedValue('weekly-post'),
      syncDiscToWeeklyPost: jest.fn().mockResolvedValue({ synced: true }),
    };
    const monthly = {
      generateBestDiscsWordPressPost: jest
        .fn()
        .mockResolvedValue('monthly-post'),
      syncDiscToMonthlyPost: jest.fn().mockResolvedValue({ synced: true }),
    };
    const facade = new ListsService(
      crud as any,
      calendar as any,
      coordinator as any,
      weekly as any,
      monthly as any,
    );
    return { facade, crud, coordinator, weekly, monthly };
  };

  it('delegates update and remove with the original arguments', async () => {
    const { facade, coordinator } = makeFacade();
    const update = { closeDate: null } as any;
    const manager = {} as any;

    await expect(facade.update('list-id', update)).resolves.toBe('updated');
    await expect(facade.removeList('list-id', manager)).resolves.toBe(
      'removed',
    );

    expect(coordinator.update).toHaveBeenCalledWith('list-id', update);
    expect(coordinator.removeList).toHaveBeenCalledWith('list-id', manager);
  });

  it('routes WordPress operations through the existing publisher by list type', async () => {
    const { facade, crud, weekly, monthly } = makeFacade();
    const assignment = { id: 'assignment-id', disc: { id: 'disc-id' } };
    crud.findOne.mockResolvedValue({
      type: ListType.WEEK,
      asignations: [assignment],
    });
    await expect(
      facade.syncDiscToWordPress('list-id', 'assignment-id'),
    ).resolves.toEqual({
      synced: true,
    });
    expect(weekly.syncDiscToWeeklyPost).toHaveBeenCalledWith(
      expect.objectContaining({ type: ListType.WEEK }),
      assignment,
    );
    expect(monthly.syncDiscToMonthlyPost).not.toHaveBeenCalled();

    crud.findOne.mockResolvedValue({
      type: ListType.MONTH,
      asignations: [assignment],
    });
    await facade.syncDiscToWordPress('list-id', 'assignment-id');
    expect(monthly.syncDiscToMonthlyPost).toHaveBeenCalledWith(
      expect.objectContaining({ type: ListType.MONTH }),
      assignment,
    );
  });

  it('returns the existing no-op result when no matching assignment exists', async () => {
    const { facade, weekly, monthly } = makeFacade();
    await expect(
      facade.syncDiscToWordPress('list-id', 'missing'),
    ).resolves.toEqual({
      synced: false,
    });
    expect(weekly.syncDiscToWeeklyPost).not.toHaveBeenCalled();
    expect(monthly.syncDiscToMonthlyPost).not.toHaveBeenCalled();
  });
});
