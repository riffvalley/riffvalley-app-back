import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In, Not, Repository } from 'typeorm';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { List, ListStatus, ListType } from '../../entities/list.entity';
import { CreateListDto } from '../../dto/create-list.dto';
import { ListCrudService } from '../list-crud.service';
import { ListsService } from '../../list.service';
import { ListCalendarService } from '../list-calendar.service';
import { ListContentCoordinator } from '../list-content-coordinator.service';
import { WeeklyListPublisherService } from '../../wordpress/weekly-list-publisher.service';
import { MonthlyListPublisherService } from '../../wordpress/monthly-list-publisher.service';

describe('ListCrudService', () => {
  let service: ListCrudService;
  let repository: Repository<List>;
  let save: jest.SpiedFunction<Repository<List>['save']>;
  let findAndCount: jest.SpiedFunction<Repository<List>['findAndCount']>;
  let findOneByOrFail: jest.SpiedFunction<Repository<List>['findOneByOrFail']>;

  beforeEach(() => {
    const manager = new DataSource({ type: 'postgres' }).manager;
    repository = new Repository(List, manager);
    jest
      .spyOn(repository, 'create')
      .mockImplementation((value) => Object.assign(new List(), value));
    save = jest
      .spyOn(repository, 'save')
      .mockImplementation(async (value) => Object.assign(new List(), value));
    findAndCount = jest
      .spyOn(repository, 'findAndCount')
      .mockResolvedValue([[], 0]);
    findOneByOrFail = jest.spyOn(repository, 'findOneByOrFail');
    service = new ListCrudService(repository);
  });

  it('creates SPECIAL without adding editorial dates', async () => {
    const dto: CreateListDto = { name: 'Special list', type: ListType.SPECIAL };

    await expect(service.create(dto)).resolves.toEqual(
      expect.objectContaining(dto),
    );
    expect(repository.create).toHaveBeenCalledWith(dto);
    expect(repository.save).toHaveBeenCalledWith(dto);
  });

  it.each(['listDate', 'releaseDate', 'closeDate'] as const)(
    'rejects %s for SPECIAL before persistence',
    async (field) => {
      await expect(
        service.create({
          name: 'Special list',
          type: ListType.SPECIAL,
          [field]: '2026-10-01T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it.each([ListType.WEEK, ListType.MONTH])(
    'requires a valid releaseDate when creating %s directly',
    async (type) => {
      for (const releaseDate of [undefined, null, 'not-a-date']) {
        await expect(
          service.create({ name: 'Editorial list', type, releaseDate }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it.each([ListType.WEEK, ListType.MONTH])(
    'accepts valid dates when creating %s directly',
    async (type) => {
      const dto = {
        name: 'Editorial list',
        type,
        releaseDate: '2026-10-01T00:00:00.000Z',
      };

      await service.create(dto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining(dto),
      );
    },
  );

  it('preserves query filters, sort, pagination and response shape', async () => {
    const lists = [Object.assign(new List(), { id: 'list-1' })];
    findAndCount.mockResolvedValue([lists, 11]);

    await expect(
      service.findAll({
        limit: 5,
        offset: 5,
        statusExclusions: [ListStatus.NEW],
      }),
    ).resolves.toEqual({
      totalItems: 11,
      totalPages: 3,
      currentPage: 2,
      limit: 5,
      data: lists,
    });
    const [query] = findAndCount.mock.calls[0];
    expect(query).toEqual({
      take: 5,
      skip: 5,
      where: { status: Not(In([ListStatus.NEW])) },
      order: { name: 'ASC' },
    });
  });

  it('uses default pagination values and an empty where condition', async () => {
    await expect(service.findAll({})).resolves.toEqual({
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      limit: 40,
      data: [],
    });
    expect(repository.findAndCount).toHaveBeenCalledWith({
      take: 40,
      skip: 0,
      where: {},
      order: { name: 'ASC' },
    });
  });

  it('propagates findAndCount repository failures', async () => {
    const error = new Error('list query failed');
    findAndCount.mockRejectedValueOnce(error);

    await expect(service.findAll({})).rejects.toBe(error);
  });

  it('maps an absent record and repository read errors to the existing not-found response', async () => {
    findOneByOrFail.mockRejectedValueOnce(new Error('absent'));
    await expect(service.findOne('missing-id')).rejects.toMatchObject({
      status: 404,
      message: 'List with id missing-id not found',
    });

    findOneByOrFail.mockRejectedValueOnce(new Error('repository unavailable'));
    await expect(service.findOne('list-id')).rejects.toMatchObject({
      status: 404,
      message: 'List with id list-id not found',
    });
  });

  it('creates a VIDEO list with the supplied name and dates', async () => {
    const releaseDate = new Date('2026-10-01T12:00:00.000Z');
    const listDate = new Date('2026-10-02T15:30:00.000Z');
    const closeDate = new Date('2026-10-03T00:00:00.000Z');

    await service.createVideoList(
      releaseDate,
      listDate,
      'Video list',
      closeDate,
    );

    expect(repository.create).toHaveBeenCalledWith({
      name: 'Video list',
      type: ListType.VIDEO,
      status: ListStatus.NEW,
      listDate,
      releaseDate,
      closeDate,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('uses the existing first-of-month default when creating a VIDEO list', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 16, 10));

    try {
      await service.createVideoList();

      expect(repository.create).toHaveBeenCalledWith({
        name: 'Videos Octubre',
        type: ListType.VIDEO,
        status: ListStatus.NEW,
        listDate: new Date(2026, 9, 1),
        releaseDate: new Date(2026, 9, 1),
        closeDate: undefined,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    [ListType.WEEK, 'createWeeklyList', 'Discos Octubre Semana 1'],
    [ListType.MONTH, 'createMonthlyList', 'Discos Octubre 2026'],
  ] as const)(
    'creates %s with required release date and the existing generated name',
    async (type, method, name) => {
      const releaseDate = new Date('2026-10-01T12:00:00.000Z');
      const normalizedListDate = new Date(releaseDate);
      normalizedListDate.setHours(0, 0, 0, 0);
      const created = await service[method](releaseDate);

      expect(created).toEqual(
        expect.objectContaining({
          name,
          type,
          status: ListStatus.NEW,
          releaseDate,
          listDate: normalizedListDate,
        }),
      );
      expect(repository.save).toHaveBeenCalledWith(created);
    },
  );

  it.each(['createWeeklyList', 'createMonthlyList'] as const)(
    'requires a valid publication date and does not invent one in %s',
    async (method) => {
      for (const releaseDate of [undefined, null, new Date('invalid')]) {
        await expect(
          Reflect.apply(service[method], service, [releaseDate]),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('saves typed list creation through the supplied transaction manager', async () => {
    const manager = new DataSource({ type: 'postgres' }).manager;
    const transactionalRepository = new Repository(List, manager);
    const transactionalSave = jest
      .spyOn(transactionalRepository, 'save')
      .mockImplementation(async (value) => Object.assign(new List(), value));
    const getRepository = jest
      .spyOn(manager, 'getRepository')
      .mockReturnValue(transactionalRepository);

    await service.createWeeklyList(
      new Date('2026-10-01T12:00:00.000Z'),
      undefined,
      undefined,
      manager,
    );

    expect(getRepository).toHaveBeenCalledWith(List);
    expect(transactionalSave).toHaveBeenCalledTimes(1);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('maps persistence errors to the existing HTTP errors', async () => {
    save.mockRejectedValueOnce({
      code: '23505',
      detail: 'duplicate',
    });
    await expect(
      service.create({ name: 'List', type: ListType.SPECIAL }),
    ).rejects.toMatchObject({ status: 400, message: 'duplicate' });

    save.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      service.create({ name: 'List', type: ListType.SPECIAL }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe('ListsService CRUD facade', () => {
  it('delegates CRUD and typed creation while preserving public arguments and results', async () => {
    const crudService = {
      create: jest.fn().mockResolvedValue('created'),
      findAll: jest.fn().mockResolvedValue('page'),
      findOne: jest.fn().mockResolvedValue('found'),
      createVideoList: jest.fn().mockResolvedValue('video'),
      createWeeklyList: jest.fn().mockResolvedValue('weekly'),
      createMonthlyList: jest.fn().mockResolvedValue('monthly'),
    };
    const dto: CreateListDto = { name: 'List', type: ListType.SPECIAL };
    const pagination: PaginationDto = { limit: 10 };
    const releaseDate = new Date('2026-10-01T12:00:00.000Z');
    const listDate = new Date('2026-10-02T00:00:00.000Z');
    const closeDate = new Date('2026-10-03T00:00:00.000Z');
    const manager = new DataSource({ type: 'postgres' }).manager;
    const module = await Test.createTestingModule({
      providers: [
        ListsService,
        { provide: ListCrudService, useValue: crudService },
        { provide: ListCalendarService, useValue: {} },
        { provide: ListContentCoordinator, useValue: {} },
        { provide: WeeklyListPublisherService, useValue: {} },
        { provide: MonthlyListPublisherService, useValue: {} },
      ],
    }).compile();
    const facade = module.get(ListsService);

    await expect(facade.create(dto)).resolves.toBe('created');
    await expect(facade.findAll(pagination)).resolves.toBe('page');
    await expect(facade.findOne('list-id')).resolves.toBe('found');
    await expect(
      facade.createVideoList(releaseDate, listDate, 'Video', closeDate),
    ).resolves.toBe('video');
    await expect(
      facade.createVideoList(
        releaseDate,
        listDate,
        'Video',
        closeDate,
        manager,
      ),
    ).resolves.toBe('video');
    await expect(
      facade.createWeeklyList(releaseDate, listDate, closeDate, manager),
    ).resolves.toBe('weekly');
    await expect(
      facade.createMonthlyList(releaseDate, listDate, closeDate, manager),
    ).resolves.toBe('monthly');

    expect(crudService.create).toHaveBeenCalledWith(dto);
    expect(crudService.findAll).toHaveBeenCalledWith(pagination);
    expect(crudService.findOne).toHaveBeenCalledWith('list-id');
    expect(crudService.createVideoList).toHaveBeenCalledWith(
      releaseDate,
      listDate,
      'Video',
      closeDate,
      undefined,
    );
    expect(crudService.createVideoList).toHaveBeenLastCalledWith(
      releaseDate,
      listDate,
      'Video',
      closeDate,
      manager,
    );
    expect(crudService.createWeeklyList).toHaveBeenCalledWith(
      releaseDate,
      listDate,
      closeDate,
      manager,
    );
    expect(crudService.createMonthlyList).toHaveBeenCalledWith(
      releaseDate,
      listDate,
      closeDate,
      manager,
    );
  });
});
