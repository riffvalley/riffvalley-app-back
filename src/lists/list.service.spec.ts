import { FindOperator } from 'typeorm';
import { ListsService, getWeeklyOpenCutoff } from './list.service';

type Row = { closeDate: Date | null; releaseDate: Date | null; listDate: Date };

// Evalúa en memoria las condiciones `where` (array = OR) que genera el servicio.
function matches(where: any, row: Row): boolean {
  return where.some((cond: any) =>
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
          return (
            value !== null && value >= op.value[0] && value <= op.value[1]
          );
        default:
          throw new Error(`Operador no soportado: ${op.type}`);
      }
    }),
  );
}

describe('ListsService weekly radars', () => {
  // Radar de la semana del 14-09-2026: viernes 18, release sábado 19, cierre domingo 20.
  const radar: Row = {
    listDate: new Date(2026, 8, 18),
    releaseDate: new Date(2026, 8, 19),
    closeDate: new Date(2026, 8, 20),
  };
  const legacyRadar: Row = { ...radar, closeDate: null };

  let rows: Row[];
  let service: ListsService;

  beforeEach(() => {
    rows = [];
    const repo = {
      find: jest.fn(async ({ where }) => rows.filter((r) => matches(where, r))),
    };
    service = new ListsService(repo as any, {} as any, {} as any, {} as any);
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  const at = (day: number, hour = 10) =>
    jest.setSystemTime(new Date(2026, 8, day, hour));

  it.each([
    ['sábado', 19],
    ['domingo', 20],
    ['lunes', 21],
    ['martes', 22],
  ])('mantiene el radar en actuales el %s', async (_name, day) => {
    rows = [radar];
    at(day as number);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(1);
    expect(await service.findPastWeeklyListsByMonth(2026, 9)).toHaveLength(0);
  });

  it('pasa el radar a pasadas el miércoles', async () => {
    rows = [radar];
    at(23, 0);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(0);
    expect(await service.findPastWeeklyListsByMonth(2026, 9)).toHaveLength(1);
  });

  it('usa releaseDate como respaldo si closeDate es null', async () => {
    rows = [legacyRadar];
    at(20);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(1);
    at(22);
    expect(await service.findCurrentWeeklyLists()).toHaveLength(0);
    expect(await service.findPastWeeklyListsByMonth(2026, 9)).toHaveLength(1);
  });

  it('nunca devuelve una lista en actuales y pasadas a la vez', async () => {
    rows = [radar, legacyRadar];
    for (let day = 15; day <= 26; day++) {
      at(day);
      const current = await service.findCurrentWeeklyLists();
      const past = await service.findPastWeeklyListsByMonth(2026, 9);
      expect(current.length + past.length).toBe(rows.length);
    }
  });

  it('getWeeklyOpenCutoff resta 2 días al inicio del día', () => {
    expect(getWeeklyOpenCutoff(new Date(2026, 8, 22, 15))).toEqual(
      new Date(2026, 8, 20),
    );
  });
});
