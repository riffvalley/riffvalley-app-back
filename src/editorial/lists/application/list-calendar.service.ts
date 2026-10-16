import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  IsNull,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { List, ListType } from '../entities/list.entity';

// Un radar semanal sigue abierto hasta WEEKLY_CLOSE_GRACE_DAYS después de su
// closeDate (domingo por defecto, es decir, hasta el martes inclusive).
export const WEEKLY_CLOSE_GRACE_DAYS = 2;

// Fecha límite: un radar está abierto si (closeDate ?? releaseDate) >= cutoff.
export function getWeeklyOpenCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - WEEKLY_CLOSE_GRACE_DAYS);
  return cutoff;
}

// La lista mensual de un mes sigue siendo "actual" hasta el día MONTHLY_CLOSE_DAY
// del mes siguiente (la del mes nuevo se crea después, hacia el día 14).
export const MONTHLY_CLOSE_DAY = 12;

// Primer día del mes de referencia: hasta el día 12 sigue siendo el mes anterior.
export function getMonthlyReferenceStart(now: Date = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (now.getDate() <= MONTHLY_CLOSE_DAY) {
    start.setMonth(start.getMonth() - 1);
  }
  return start;
}

@Injectable()
export class ListCalendarService {
  constructor(
    @InjectRepository(List)
    private readonly listRepository: Repository<List>,
  ) {}

  async findUpcoming() {
    const today = new Date();
    const twoWeeksFromToday = new Date();
    twoWeeksFromToday.setDate(today.getDate() + 14);

    return this.listRepository.find({
      where: {
        releaseDate: Between(today, twoWeeksFromToday),
      },
      order: {
        releaseDate: 'ASC',
      },
    });
  }

  async findNext() {
    const today = new Date();
    const twoWeeksFromToday = new Date();
    twoWeeksFromToday.setDate(today.getDate() + 14);

    return this.listRepository.find({
      where: {
        releaseDate: MoreThan(twoWeeksFromToday),
      },
      order: {
        releaseDate: 'ASC',
      },
    });
  }

  async findAllSpecialLists() {
    return this.listRepository.find({
      where: {
        type: ListType.SPECIAL,
      },
      order: {
        name: 'ASC',
      },
    });
  }

  async findAllVideoLists() {
    return this.listRepository.find({
      where: {
        type: ListType.VIDEO,
      },
      order: {
        name: 'ASC',
      },
    });
  }

  async findCurrentMonthLists() {
    const referenceStart = getMonthlyReferenceStart();

    return this.listRepository.find({
      where: {
        type: ListType.MONTH,
        listDate: MoreThanOrEqual(referenceStart),
      },
      order: {
        listDate: 'ASC',
      },
    });
  }

  async findPastMonthListsByYear(year: number) {
    const startDate = new Date(year, 0, 1);
    let endDate = new Date(year, 11, 31);
    endDate.setHours(23, 59, 59, 999);

    const referenceStart = getMonthlyReferenceStart();
    if (referenceStart <= endDate) {
      endDate = new Date(referenceStart.getTime() - 1);
    }

    return this.listRepository.find({
      where: {
        type: ListType.MONTH,
        listDate: Between(startDate, endDate),
      },
      order: {
        listDate: 'DESC',
      },
    });
  }

  async findCurrentWeeklyLists() {
    const cutoff = getWeeklyOpenCutoff();

    return this.listRepository.find({
      where: [
        {
          type: ListType.WEEK,
          closeDate: MoreThanOrEqual(cutoff),
        },
        {
          type: ListType.WEEK,
          closeDate: IsNull(),
          releaseDate: MoreThanOrEqual(cutoff),
        },
      ],
      order: {
        listDate: 'ASC',
      },
    });
  }

  async findPastWeeklyListsByMonth(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999);

    const cutoff = getWeeklyOpenCutoff();

    return this.listRepository.find({
      where: [
        {
          type: ListType.WEEK,
          listDate: Between(startDate, endDate),
          closeDate: LessThan(cutoff),
        },
        {
          type: ListType.WEEK,
          listDate: Between(startDate, endDate),
          closeDate: IsNull(),
          releaseDate: LessThan(cutoff),
        },
      ],
      order: {
        listDate: 'DESC',
      },
    });
  }

  async findCurrentVideoLists() {
    const today = new Date();
    today.setDate(1);
    today.setHours(0, 0, 0, 0);

    return this.listRepository.find({
      where: {
        type: ListType.VIDEO,
        listDate: MoreThanOrEqual(today),
      },
      order: {
        listDate: 'ASC',
      },
    });
  }

  async findPastVideoListsByYear(year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    endDate.setHours(23, 59, 59, 999);

    return this.listRepository.find({
      where: {
        type: ListType.VIDEO,
        listDate: Between(startDate, endDate),
      },
      order: {
        listDate: 'DESC',
      },
    });
  }
}
