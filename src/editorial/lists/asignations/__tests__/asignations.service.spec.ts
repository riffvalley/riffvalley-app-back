import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DataSource,
  DeepPartial,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import type { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { AsignationsService } from '../asignations.service';
import { Asignation } from '../entities/asignations.entity';
import { List, ListType } from '../../entities/list.entity';
import { User } from 'src/identity/auth/entities/user.entity';
import { Disc } from 'src/catalog/discs/entities/disc.entity';
import { Artist } from 'src/catalog/artists/entities/artist.entity';
import { ListsService } from '../../list.service';
import { ListsEventPublisher } from '../../realtime/lists-event-publisher.service';
import type { ListsEvent } from '../../realtime/contracts/lists-event.contract';
import { CreateAsignationDto } from '../dto/create-asignations.dto';
import { UpdateAsignationDto } from '../dto/update-asignations.dto';

jest.mock('sanitize-html', () => jest.fn((value: string) => value));

class TransactionTestEntityManager extends EntityManager {
  transaction<T>(
    runInTransaction: (entityManager: EntityManager) => Promise<T>,
  ): Promise<T>;
  transaction<T>(
    isolationLevel: IsolationLevel,
    runInTransaction: (entityManager: EntityManager) => Promise<T>,
  ): Promise<T>;
  transaction<T>(
    isolationOrCallback:
      | IsolationLevel
      | ((entityManager: EntityManager) => Promise<T>),
    callback?: (entityManager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const runInTransaction =
      typeof isolationOrCallback === 'function'
        ? isolationOrCallback
        : callback;
    if (!runInTransaction) {
      return Promise.reject(new Error('A transaction callback is required'));
    }
    return runInTransaction(this);
  }
}

describe('AsignationsService error classification', () => {
  const asignationId = 'c17ee051-1a9b-4f33-a2b4-67f1a2508a4c';
  const listId = '5e87fa93-7b8d-48f9-983b-01dca7a54c11';
  const userId = '96066b47-c254-4592-a526-8954c8601496';
  const discId = 'a9502868-ed1d-4f50-9592-608aa5e235c1';
  const relationConstraints = [
    ['userId', 'FK_9d41fe509640ba0c786b5daf75d'],
    ['discId', 'FK_d9e53d3460644eb1f381733ce82'],
    ['listId', 'FK_0f26ccdd372668431e245de0f3e'],
  ] as const;

  let service: AsignationsService;
  let asignationRepository: Repository<Asignation>;
  let userRepository: Repository<User>;
  let discRepository: Repository<Disc>;
  let listRepository: Repository<List>;
  let listsService: jest.Mocked<Pick<ListsService, 'syncDiscToWordPress'>>;
  let eventPublisher: ListsEventPublisher;
  let publishedEvents: ListsEvent[];
  let unsubscribeEvents: () => void;
  let manager: EntityManager;
  let asignationCreate: jest.SpiedFunction<Repository<Asignation>['create']>;
  let asignationSave: jest.SpiedFunction<Repository<Asignation>['save']>;
  let asignationFindOneBy: jest.SpiedFunction<
    Repository<Asignation>['findOneBy']
  >;
  let asignationPreload: jest.SpiedFunction<Repository<Asignation>['preload']>;
  let asignationDelete: jest.SpiedFunction<Repository<Asignation>['delete']>;
  let asignationFindAndCount: jest.SpiedFunction<
    Repository<Asignation>['findAndCount']
  >;
  let asignationFindOne: jest.SpiedFunction<Repository<Asignation>['findOne']>;
  let userFindOneBy: jest.SpiedFunction<Repository<User>['findOneBy']>;
  let discFindOneBy: jest.SpiedFunction<Repository<Disc>['findOneBy']>;
  let listFindOneBy: jest.SpiedFunction<Repository<List>['findOneBy']>;
  let transactionQuery: jest.SpiedFunction<EntityManager['query']>;
  let asignationQuery: jest.SpiedFunction<Repository<Asignation>['query']>;
  let groupCount = 0;

  function asignationFixture(values: DeepPartial<Asignation>): Asignation {
    return Object.assign(new Asignation(), values);
  }

  function listFixture(values: DeepPartial<List>): List {
    return Object.assign(new List(), values);
  }

  function discFixture(id: string): Disc {
    const disc = Object.assign(new Disc(), {
      id,
      artist: Object.assign(new Artist(), { name: 'Grupo 1' }),
    });
    for (const property of [
      'debut',
      'ep',
      'featured',
      'pinned',
      'verified',
    ] as const) {
      Object.defineProperty(disc, property, { enumerable: false });
    }
    return disc;
  }

  function queryFailedError(
    code: string,
    options: { table?: string; constraint?: string } = {},
  ): QueryFailedError {
    return new QueryFailedError(
      'INSERT INTO asignation',
      [],
      Object.assign(new Error('private SQL and constraint detail'), {
        code,
        ...options,
      }),
    );
  }

  async function expectNotFound(action: Promise<unknown>) {
    let error: unknown;
    try {
      await action;
    } catch (caught) {
      error = caught;
    }

    if (!(error instanceof NotFoundException)) {
      throw new Error('Expected a NotFoundException');
    }
    expect(error.getStatus()).toBe(404);
    return error;
  }

  beforeEach(async () => {
    groupCount = 0;
    jest.restoreAllMocks();
    manager = new TransactionTestEntityManager(
      new DataSource({ type: 'postgres' }),
    );
    asignationRepository = new Repository(Asignation, manager);
    userRepository = new Repository(User, manager);
    discRepository = new Repository(Disc, manager);
    listRepository = new Repository(List, manager);

    asignationCreate = jest
      .spyOn(asignationRepository, 'create')
      .mockImplementation((values) => Object.assign(new Asignation(), values));
    asignationSave = jest
      .spyOn(asignationRepository, 'save')
      .mockImplementation(async (values) =>
        Object.assign(new Asignation(), values),
      );
    asignationFindOneBy = jest
      .spyOn(asignationRepository, 'findOneBy')
      .mockResolvedValue(asignationFixture({ id: asignationId }));
    asignationPreload = jest
      .spyOn(asignationRepository, 'preload')
      .mockImplementation(async (values) => asignationFixture(values));
    asignationDelete = jest
      .spyOn(asignationRepository, 'delete')
      .mockResolvedValue({ affected: 1, raw: [] });
    asignationFindAndCount = jest
      .spyOn(asignationRepository, 'findAndCount')
      .mockResolvedValue([[], 0]);
    asignationFindOne = jest
      .spyOn(asignationRepository, 'findOne')
      .mockResolvedValue(
        asignationFixture({
          id: asignationId,
          list: listFixture({ id: listId, type: ListType.WEEK }),
          position: 2,
          disc: discFixture(discId),
        }),
      );
    asignationQuery = jest
      .spyOn(asignationRepository, 'query')
      .mockImplementation(
        async (): Promise<Array<{ count: number }>> => [{ count: groupCount }],
      );
    userFindOneBy = jest
      .spyOn(userRepository, 'findOneBy')
      .mockResolvedValue(
        Object.assign(new User(), { id: userId, username: 'Fulanito' }),
      );
    discFindOneBy = jest
      .spyOn(discRepository, 'findOneBy')
      .mockResolvedValue(discFixture(discId));
    listFindOneBy = jest
      .spyOn(listRepository, 'findOneBy')
      .mockResolvedValue(listFixture({ id: listId, type: ListType.WEEK }));

    transactionQuery = jest.spyOn(manager, 'query').mockResolvedValue([]);
    jest.spyOn(manager, 'getRepository').mockImplementation((target) => {
      if (target === List) return listRepository;
      if (target === User) return userRepository;
      if (target === Disc) return discRepository;
      return asignationRepository;
    });
    listsService = { syncDiscToWordPress: jest.fn() };
    publishedEvents = [];

    const module = await Test.createTestingModule({
      providers: [
        AsignationsService,
        {
          provide: getRepositoryToken(Asignation),
          useValue: asignationRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Disc), useValue: discRepository },
        { provide: getRepositoryToken(List), useValue: listRepository },
        { provide: ListsService, useValue: listsService },
        ListsEventPublisher,
      ],
    }).compile();
    service = module.get(AsignationsService);
    eventPublisher = module.get(ListsEventPublisher);
    unsubscribeEvents = eventPublisher.subscribe((event) =>
      publishedEvents.push(event),
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => unsubscribeEvents());

  it('returns an existing asignation without changing its payload', async () => {
    const existing = asignationFixture({ id: asignationId, position: 2 });
    asignationFindOneBy.mockResolvedValue(existing);

    await expect(service.findOne(asignationId)).resolves.toBe(existing);
    expect(asignationRepository.findOneBy).toHaveBeenCalledWith({
      id: asignationId,
    });
  });

  it('returns 404 for a missing asignation and propagates repository failures', async () => {
    asignationFindOneBy.mockResolvedValueOnce(null);
    const notFound = await expectNotFound(service.findOne(asignationId));
    expect(notFound.message).toBe(
      `Asignation with id ${asignationId} not found`,
    );

    const repositoryError = new Error('database unavailable');
    asignationFindOneBy.mockRejectedValueOnce(repositoryError);
    await expect(service.findOne(asignationId)).rejects.toBe(repositoryError);
  });

  it('creates with valid related records and preserves the response', async () => {
    const created = asignationFixture({ position: 2 });
    const saved = asignationFixture({ id: asignationId, position: 2 });
    asignationCreate.mockReturnValue(created);
    asignationSave.mockResolvedValue(saved);

    const result = await service.create({
      listId,
      userId,
      discId,
      position: 2,
    });

    expect(result).toBe(created);
    expect(asignationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: userId }),
        disc: expect.objectContaining({ id: discId }),
        list: expect.objectContaining({ id: listId }),
        position: 2,
      }),
    );
  });

  it.each([
    ['Radar inbox', ListType.WEEK, 0],
    ['Radar panel', ListType.WEEK, 3],
    ['Radar null position', ListType.WEEK, null],
    ['monthly list', ListType.MONTH, undefined],
  ])(
    'publishes one descriptive event for a disc created in a %s',
    async (_label, type, position) => {
      listFindOneBy.mockResolvedValue(listFixture({ id: listId, type }));
      asignationSave.mockImplementation(async (values) =>
        Object.assign(new Asignation(), values, { id: asignationId }),
      );
      const context = {
        actor: {
          kind: 'user' as const,
          id: 'actor-id',
          displayName: 'Editora',
        },
        sourceId: '29975434-5c45-4a8f-a197-bcb73e215830',
      };

      await service.create(
        Object.assign(new CreateAsignationDto(), {
          listId,
          userId,
          discId,
          ...(position !== undefined ? { position } : {}),
        }),
        context,
      );

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]).toMatchObject({
        type: 'lists.invalidate',
        version: 1,
        reason: 'change',
        action: 'assignment.created',
        actor: { id: 'actor-id', displayName: 'Editora' },
        assignee: { id: userId, displayName: 'Fulanito' },
        list: { id: listId, type },
        assignmentId: asignationId,
        discId,
        artistName: 'Grupo 1',
        newPosition: position ?? null,
        sourceId: context.sourceId,
      });
      expect(JSON.stringify(publishedEvents[0])).not.toMatch(
        /description|similarBands|spotifyTrackId|email|password/,
      );
    },
  );

  it('does not publish a descriptive creation for no-disc or ineligible lists', async () => {
    listFindOneBy.mockResolvedValue(
      listFixture({ id: listId, type: ListType.WEEK }),
    );
    await service.create(
      { listId },
      {
        actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' },
      },
    );
    expect(publishedEvents).toEqual([]);

    listFindOneBy.mockResolvedValue(
      listFixture({ id: listId, type: ListType.SPECIAL }),
    );
    await service.create(
      { listId, discId },
      {
        actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' },
      },
    );
    expect(publishedEvents).toEqual([]);
  });

  it('publishes no creation event when the assignment transaction fails', async () => {
    const databaseError = new Error('write failed');
    asignationSave.mockRejectedValue(databaseError);

    await expect(
      service.create(
        { listId, discId },
        { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
      ),
    ).rejects.toBe(databaseError);
    expect(publishedEvents).toEqual([]);
  });

  it('uses a list-scoped generic fallback when descriptive metadata is incomplete', async () => {
    listFindOneBy.mockResolvedValue(
      listFixture({ id: listId, type: ListType.MONTH }),
    );
    discFindOneBy.mockResolvedValue(Object.assign(new Disc(), { id: discId }));
    asignationSave.mockImplementation(async (values) =>
      Object.assign(new Asignation(), values, { id: asignationId }),
    );

    await service.create(
      { listId, discId },
      { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
    );

    expect(publishedEvents).toEqual([
      {
        type: 'lists.invalidate',
        version: 1,
        reason: 'change',
        list: { id: listId, type: ListType.MONTH },
      },
    ]);
    expect(JSON.stringify(publishedEvents[0])).not.toMatch(
      /artistName|assignee|assignmentId|discId/,
    );
  });

  it('allows the first and fourth Radar discs, rejects the fifth without saving', async () => {
    listFindOneBy.mockResolvedValue(
      listFixture({ id: listId, type: ListType.WEEK }),
    );
    await expect(
      service.create({ listId, discId, position: 0 }),
    ).resolves.toBeDefined();
    expect(asignationQuery).not.toHaveBeenCalled();

    const createAt = (position: number) =>
      service.create({ listId, discId, position });

    groupCount = 0;
    await expect(createAt(1)).resolves.toBeDefined();
    groupCount = 3;
    await expect(createAt(1)).resolves.toBeDefined();
    groupCount = 4;
    const previousSaves = asignationSave.mock.calls.length;
    await expect(createAt(1)).rejects.toMatchObject({
      status: 400,
      message: 'Un grupo de Radar admite como máximo cuatro discos.',
    });
    expect(asignationSave).toHaveBeenCalledTimes(previousSaves);
  });

  it('limits nonzero negative positions as groups too', async () => {
    listFindOneBy.mockResolvedValue(
      listFixture({ id: listId, type: ListType.WEEK }),
    );
    groupCount = 4;

    await expect(
      service.create({ listId, discId, position: -1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['SPECIAL', ListType.SPECIAL],
    ['MONTH', ListType.MONTH],
  ])('does not apply the cap to %s lists', async (_name, type) => {
    listFindOneBy.mockResolvedValue(listFixture({ id: listId, type }));
    groupCount = 9;
    await expect(
      service.create({ listId, discId, position: 1 }),
    ).resolves.toBeDefined();
    expect(asignationQuery).not.toHaveBeenCalled();
  });

  it('takes a transaction-scoped advisory lock before counting and saving', async () => {
    listFindOneBy.mockResolvedValue(
      listFixture({ id: listId, type: ListType.WEEK }),
    );
    await service.create({ listId, discId, position: 3 });

    expect(transactionQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`riffvalley:radar-group:${listId}:3`],
    );
    expect(transactionQuery.mock.invocationCallOrder[0]).toBeLessThan(
      asignationQuery.mock.invocationCallOrder[0],
    );
  });

  it('propagates unexpected create repository failures', async () => {
    const repositoryError = new Error('database unavailable');
    listFindOneBy.mockRejectedValue(repositoryError);

    await expect(service.create({ listId })).rejects.toBe(repositoryError);
  });

  it.each([
    ['list', listId],
    ['user', userId],
    ['disc', discId],
  ])(
    'returns 404 when the referenced %s does not exist',
    async (relation, id) => {
      if (relation === 'list') listFindOneBy.mockResolvedValue(null);
      if (relation === 'user') userFindOneBy.mockResolvedValue(null);
      if (relation === 'disc') discFindOneBy.mockResolvedValue(null);

      const error = await expectNotFound(
        service.create({
          listId,
          ...(relation === 'user' ? { userId: id } : {}),
          ...(relation === 'disc' ? { discId: id } : {}),
        }),
      );

      expect(error.message).toContain(
        `${relation === 'list' ? 'List' : relation === 'user' ? 'User' : 'Disc'} with id ${id} not found`,
      );
      expect(asignationRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each(relationConstraints)(
    'maps only the known %s foreign key violation to a safe 404',
    async (_column, constraint) => {
      const databaseError = queryFailedError('23503', {
        table: 'asignation',
        constraint,
      });
      asignationSave.mockRejectedValue(databaseError);

      const error = await expectNotFound(
        service.create({ listId, userId, discId }),
      );

      expect(error.message).toBe(
        'One or more referenced resources were not found',
      );
      expect(error.message).not.toContain('private SQL');
      expect(error.message).not.toContain(constraint);
    },
  );

  it.each([
    ['an unrelated table', 'disc', 'FK_d9e53d3460644eb1f381733ce82'],
    ['an unknown constraint', 'asignation', 'FK_unrelated'],
  ])(
    'propagates a foreign key violation from %s',
    async (_reason, table, constraint) => {
      const foreignKeyError = queryFailedError('23503', {
        table,
        constraint,
      });
      asignationSave.mockRejectedValue(foreignKeyError);

      await expect(service.create({ listId })).rejects.toBe(foreignKeyError);
    },
  );

  it('preserves the existing 400 status for unique violations without exposing driver detail', async () => {
    const databaseError = queryFailedError('23505', {
      table: 'asignation',
      constraint: 'UQ_private_name',
    });
    asignationSave.mockRejectedValue(databaseError);

    let error: unknown;
    try {
      await service.create({ listId });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    if (!(error instanceof BadRequestException)) {
      throw new Error('Expected a BadRequestException');
    }
    expect(error.getStatus()).toBe(400);
    expect(error.message).toBe('Asignation conflicts with existing data');
    expect(error.message).not.toContain('UQ_private_name');
  });

  it('returns 404 when update cannot preload the requested asignation', async () => {
    asignationFindOne.mockResolvedValue(null);

    await expectNotFound(service.update(asignationId, { done: true }));
    expect(asignationSave).not.toHaveBeenCalled();
  });

  it('updates an existing asignation with a valid user and preserves the response', async () => {
    asignationPreload.mockImplementation(async (values) =>
      asignationFixture(values),
    );

    await expect(
      service.update(asignationId, { userId, done: true }),
    ).resolves.toMatchObject({
      id: asignationId,
      user: { id: userId },
      done: true,
    });
    expect(asignationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: userId }, done: true }),
    );
  });

  it('allows updates in the same group and movement into a group with space', async () => {
    groupCount = 4;
    asignationPreload.mockImplementation(async (values) =>
      asignationFixture(values),
    );
    await expect(
      service.update(asignationId, { done: true }),
    ).resolves.toBeDefined();
    expect(asignationRepository.save).toHaveBeenCalled();

    asignationFindOne.mockResolvedValueOnce(
      asignationFixture({
        id: asignationId,
        list: listFixture({ id: listId, type: ListType.WEEK }),
        position: 1,
        disc: discFixture(discId),
      }),
    );
    groupCount = 2;
    await expect(
      service.update(asignationId, { position: 2 }),
    ).resolves.toBeDefined();
    expect(transactionQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`riffvalley:radar-group:${listId}:1`],
    );
    expect(transactionQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`riffvalley:radar-group:${listId}:2`],
    );
  });

  it.each([
    [0, 1, 'assignment.placed'],
    [1, 2, 'assignment.moved'],
    [2, 0, 'assignment.unplaced'],
  ] as const)(
    'publishes %s → %s as %s after the transaction',
    async (previousPosition, newPosition, action) => {
      const existing = asignationFixture({
        id: asignationId,
        list: listFixture({ id: listId, type: ListType.WEEK }),
        position: previousPosition,
        disc: discFixture(discId),
        user: Object.assign(new User(), { id: userId, username: 'Fulanito' }),
      });
      asignationFindOne.mockResolvedValue(existing);
      asignationPreload.mockImplementation(async (values) =>
        Object.assign(new Asignation(), existing, values),
      );
      asignationSave.mockImplementation(async (values) =>
        Object.assign(new Asignation(), values),
      );
      const context = {
        actor: {
          kind: 'user' as const,
          id: 'actor-id',
          displayName: 'Editora',
        },
        sourceId: '29975434-5c45-4a8f-a197-bcb73e215830',
      };

      await service.update(asignationId, { position: newPosition }, context);

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]).toMatchObject({
        action,
        actor: { id: 'actor-id', displayName: 'Editora' },
        assignee: { id: userId, displayName: 'Fulanito' },
        list: { id: listId, type: ListType.WEEK },
        assignmentId: asignationId,
        discId,
        artistName: 'Grupo 1',
        previousPosition,
        newPosition,
        sourceId: context.sourceId,
      });
    },
  );

  it.each([
    ['same position', 1, 1],
    ['a panel to null', 1, null],
  ])(
    'does not classify %s as a Radar position action',
    async (_label, previousPosition, newPosition) => {
      const existing = asignationFixture({
        id: asignationId,
        list: listFixture({ id: listId, type: ListType.WEEK }),
        position: previousPosition,
        disc: discFixture(discId),
      });
      asignationFindOne.mockResolvedValue(existing);
      asignationPreload.mockImplementation(async (values) =>
        Object.assign(new Asignation(), existing, values),
      );
      asignationSave.mockImplementation(async (values) =>
        Object.assign(new Asignation(), values),
      );

      await service.update(
        asignationId,
        Object.assign(new UpdateAsignationDto(), { position: newPosition }),
        { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
      );

      expect(publishedEvents).toEqual([]);
    },
  );

  it('publishes null → positive position as the first Radar placement', async () => {
    const existing = asignationFixture({
      id: asignationId,
      list: listFixture({ id: listId, type: ListType.WEEK }),
      position: null,
      disc: discFixture(discId),
    });
    asignationFindOne.mockResolvedValue(existing);
    asignationPreload.mockImplementation(async (values) =>
      Object.assign(new Asignation(), existing, values),
    );
    asignationSave.mockImplementation(async (values) =>
      Object.assign(new Asignation(), values),
    );

    await service.update(
      asignationId,
      { position: 1 },
      { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
    );

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toMatchObject({
      action: 'assignment.placed',
      previousPosition: null,
      newPosition: 1,
    });
  });

  it.each([
    ['another Radar list', ListType.WEEK, 'another-list'],
    ['a monthly list', ListType.MONTH, 'month-list'],
  ])(
    'does not emit a position event for %s',
    async (_label, targetType, targetListId) => {
      const existing = asignationFixture({
        id: asignationId,
        list: listFixture({ id: listId, type: ListType.WEEK }),
        position: 1,
        disc: discFixture(discId),
      });
      asignationFindOne.mockResolvedValue(existing);
      listFindOneBy.mockImplementation(async (where) => {
        const id =
          !Array.isArray(where) && typeof where.id === 'string'
            ? where.id
            : listId;
        return listFixture({
          id,
          type: id === listId ? ListType.WEEK : targetType,
        });
      });
      asignationPreload.mockImplementation(async (values) =>
        Object.assign(new Asignation(), existing, values),
      );
      asignationSave.mockImplementation(async (values) =>
        Object.assign(new Asignation(), values),
      );

      await service.update(
        asignationId,
        { listId: targetListId, position: 2 },
        { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
      );

      expect(publishedEvents).toEqual([]);
    },
  );

  it('publishes only the Radar movement when user assignment changes in the same patch', async () => {
    const existing = asignationFixture({
      id: asignationId,
      list: listFixture({ id: listId, type: ListType.WEEK }),
      position: 1,
      disc: discFixture(discId),
      user: Object.assign(new User(), { id: 'old-user', username: 'Old user' }),
    });
    asignationFindOne.mockResolvedValue(existing);
    asignationPreload.mockImplementation(async (values) =>
      Object.assign(new Asignation(), existing, values),
    );
    asignationSave.mockImplementation(async (values) =>
      Object.assign(new Asignation(), values),
    );

    await service.update(
      asignationId,
      { position: 2, userId },
      { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
    );

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toMatchObject({
      action: 'assignment.moved',
      assignee: { id: userId, displayName: 'Fulanito' },
    });
  });

  it('keeps the Radar movement descriptive when preload returns a partial disc relation', async () => {
    const existing = asignationFixture({
      id: asignationId,
      list: listFixture({ id: listId, type: ListType.WEEK }),
      position: 1,
      disc: discFixture(discId),
    });
    asignationFindOne.mockResolvedValue(existing);
    asignationPreload.mockResolvedValue(
      asignationFixture({
        id: asignationId,
        position: 2,
        disc: Object.assign(new Disc(), { id: discId }),
      }),
    );
    asignationSave.mockImplementation(async (values) =>
      Object.assign(new Asignation(), values),
    );

    await service.update(
      asignationId,
      { position: 2 },
      { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
    );

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toMatchObject({
      action: 'assignment.moved',
      discId,
      artistName: 'Grupo 1',
      previousPosition: 1,
      newPosition: 2,
    });
  });

  it('keeps a committed position event independent from later WordPress synchronization', async () => {
    const existing = asignationFixture({
      id: asignationId,
      list: listFixture({ id: listId, type: ListType.WEEK }),
      position: 1,
      disc: discFixture(discId),
    });
    asignationFindOne.mockResolvedValue(existing);
    asignationPreload.mockImplementation(async (values) =>
      Object.assign(new Asignation(), existing, values),
    );
    asignationSave.mockImplementation(async (values) =>
      Object.assign(new Asignation(), values),
    );
    listsService.syncDiscToWordPress.mockRejectedValue(
      new Error('WordPress unavailable'),
    );

    await expect(
      service.update(
        asignationId,
        { position: 2, description: '<p>Changed</p>' },
        { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
      ),
    ).rejects.toThrow('WordPress unavailable');
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0]).toMatchObject({
      action: 'assignment.moved',
      previousPosition: 1,
      newPosition: 2,
    });
  });

  it('publishes no position event when the update transaction fails', async () => {
    const existing = asignationFixture({
      id: asignationId,
      list: listFixture({ id: listId, type: ListType.WEEK }),
      position: 1,
      disc: discFixture(discId),
    });
    asignationFindOne.mockResolvedValue(existing);
    asignationPreload.mockImplementation(async (values) =>
      Object.assign(new Asignation(), existing, values),
    );
    const transactionError = new Error('update rolled back');
    asignationSave.mockRejectedValue(transactionError);

    await expect(
      service.update(
        asignationId,
        { position: 2 },
        { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
      ),
    ).rejects.toBe(transactionError);
    expect(publishedEvents).toEqual([]);
  });

  it('falls back after commit when changed assignee metadata cannot be loaded', async () => {
    const existing = asignationFixture({
      id: asignationId,
      list: listFixture({ id: listId, type: ListType.WEEK }),
      position: 1,
      disc: discFixture(discId),
      user: Object.assign(new User(), { id: 'old-user', username: 'Old user' }),
    });
    asignationFindOne.mockResolvedValue(existing);
    asignationPreload.mockImplementation(async (values) =>
      Object.assign(new Asignation(), existing, values),
    );
    asignationSave.mockImplementation(async (values) =>
      Object.assign(new Asignation(), values),
    );
    userFindOneBy.mockRejectedValueOnce(new Error('user lookup unavailable'));

    await expect(
      service.update(
        asignationId,
        { position: 2, userId },
        { actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' } },
      ),
    ).resolves.toMatchObject({ id: asignationId });

    expect(publishedEvents).toEqual([
      {
        type: 'lists.invalidate',
        version: 1,
        reason: 'change',
        list: { id: listId, type: ListType.WEEK },
      },
    ]);
  });

  it.each([
    ['user assignment', { userId }],
    ['done state', { done: true }],
    ['description', { description: '<p>Texto</p>' }],
  ])('does not publish for an exclusive %s update', async (_label, patch) => {
    const existing = asignationFixture({
      id: asignationId,
      list: listFixture({ id: listId, type: ListType.WEEK }),
      position: 1,
      disc: discFixture(discId),
    });
    asignationFindOne.mockResolvedValue(existing);
    asignationPreload.mockImplementation(async (values) =>
      Object.assign(new Asignation(), existing, values),
    );
    asignationSave.mockImplementation(async (values) =>
      Object.assign(new Asignation(), values),
    );

    await service.update(asignationId, patch);

    expect(publishedEvents).toEqual([]);
  });

  it('locks only the asignation row while loading its nullable relations', async () => {
    await expect(
      service.update(asignationId, { done: true }),
    ).resolves.toBeDefined();

    expect(asignationFindOne).toHaveBeenCalledWith({
      where: { id: asignationId },
      relations: ['list', 'disc'],
      lock: { mode: 'pessimistic_write', tables: ['asignation'] },
    });
  });

  it('rejects movement into a full group and preserves the existing assignment', async () => {
    asignationFindOne.mockResolvedValue(
      asignationFixture({
        id: asignationId,
        list: listFixture({ id: listId, type: ListType.WEEK }),
        position: 1,
        disc: discFixture(discId),
      }),
    );
    groupCount = 4;
    asignationSave.mockClear();

    await expect(
      service.update(asignationId, { position: 2 }),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(asignationSave).not.toHaveBeenCalled();
    expect(publishedEvents).toEqual([]);
  });

  it('does not apply the cap to update destinations outside WEEK lists', async () => {
    listFindOneBy.mockResolvedValue(
      listFixture({ id: listId, type: ListType.SPECIAL }),
    );
    asignationFindOne.mockResolvedValue(
      asignationFixture({
        id: asignationId,
        list: listFixture({ id: listId, type: ListType.SPECIAL }),
        position: 1,
        disc: discFixture(discId),
      }),
    );
    groupCount = 8;
    await expect(
      service.update(asignationId, { position: 2 }),
    ).resolves.toBeDefined();
  });

  it('maps the known user foreign key on update and propagates unrelated save failures', async () => {
    const userForeignKeyError = queryFailedError('23503', {
      table: 'asignation',
      constraint: 'FK_9d41fe509640ba0c786b5daf75d',
    });
    asignationSave.mockRejectedValueOnce(userForeignKeyError);
    await expectNotFound(service.update(asignationId, { userId }));

    const repositoryError = new Error('database unavailable');
    asignationSave.mockRejectedValueOnce(repositoryError);
    await expect(service.update(asignationId, { done: true })).rejects.toBe(
      repositoryError,
    );
  });

  it.each([ListType.WEEK, ListType.MONTH])(
    'publishes a descriptive deletion for a disc assignment in a %s list',
    async (type) => {
      asignationFindOne.mockResolvedValueOnce(
        asignationFixture({
          id: asignationId,
          list: listFixture({ id: listId, type }),
          position: 2,
          disc: discFixture(discId),
          user: Object.assign(new User(), {
            id: userId,
            username: 'Fulanito',
          }),
        }),
      );
      asignationDelete.mockImplementationOnce(async () => {
        expect(publishedEvents).toHaveLength(0);
        return { affected: 1, raw: [] };
      });
      const context = {
        actor: { kind: 'user' as const, id: 'actor-id', displayName: 'Editor' },
        sourceId: '29975434-5c45-4a8f-a197-bcb73e215830',
      };

      await expect(service.remove(asignationId, context)).resolves.toEqual({
        message: `Asignation with id ${asignationId} has been removed`,
      });

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]).toMatchObject({
        action: 'assignment.deleted',
        actor: { id: 'actor-id', displayName: 'Editor' },
        assignee: { id: userId, displayName: 'Fulanito' },
        list: { id: listId, type },
        assignmentId: asignationId,
        discId,
        artistName: 'Grupo 1',
        previousPosition: 2,
        sourceId: context.sourceId,
      });
    },
  );

  it.each([
    ['without a disc', ListType.WEEK, undefined],
    ['from a special list', ListType.SPECIAL, discFixture(discId)],
  ])('does not publish deletion %s', async (_label, type, disc) => {
    asignationFindOne.mockResolvedValueOnce(
      asignationFixture({
        id: asignationId,
        list: listFixture({ id: listId, type }),
        position: 2,
        disc,
      }),
    );
    await service.remove(asignationId, {
      actor: { kind: 'user', id: 'actor-id', displayName: 'Editor' },
    });
    expect(publishedEvents).toEqual([]);
  });

  it('does not publish a deletion when the transaction fails and preserves not-found behavior', async () => {
    asignationFindOne.mockResolvedValueOnce(null);
    await expectNotFound(service.remove(asignationId));
    expect(publishedEvents).toEqual([]);

    asignationFindOne.mockResolvedValueOnce(
      asignationFixture({
        id: asignationId,
        list: listFixture({ id: listId, type: ListType.WEEK }),
        position: 2,
        disc: discFixture(discId),
      }),
    );
    asignationDelete.mockResolvedValueOnce({ affected: 0, raw: [] });
    await expectNotFound(service.remove(asignationId));
    expect(publishedEvents).toEqual([]);
  });

  it('orders the global paginated query by id and preserves its response shape', async () => {
    await expect(service.findAll({})).resolves.toEqual({
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      limit: 10,
      data: [],
    });
    expect(asignationRepository.findAndCount).toHaveBeenCalledWith({
      order: { id: 'ASC' },
      take: 10,
      skip: 0,
    });

    const rows: Asignation[] = [
      asignationFixture({ id: 'c', list: listFixture({ id: listId }) }),
      asignationFixture({ id: 'a', list: listFixture({ id: listId }) }),
      asignationFixture({ id: 'd', list: listFixture({ id: listId }) }),
      asignationFixture({ id: 'b', list: listFixture({ id: listId }) }),
    ];
    asignationFindAndCount.mockImplementation(async ({ order, take, skip }) => {
      expect(order).toEqual({ id: 'ASC' });
      const ordered = [...rows].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      return [ordered.slice(skip, skip + take), rows.length];
    });

    const firstPage = await service.findAll({ limit: 2, offset: 0 });
    const secondPage = await service.findAll({ limit: 2, offset: 2 });

    expect(firstPage).toEqual({
      totalItems: 4,
      totalPages: 2,
      currentPage: 1,
      limit: 2,
      data: [rows[1], rows[3]],
    });
    expect(secondPage).toEqual({
      totalItems: 4,
      totalPages: 2,
      currentPage: 2,
      limit: 2,
      data: [rows[0], rows[2]],
    });
    expect(
      firstPage.data
        .map(({ id }) => id)
        .filter((id) => secondPage.data.some((row) => row.id === id)),
    ).toEqual([]);
    expect(asignationRepository.findAndCount).toHaveBeenNthCalledWith(2, {
      order: { id: 'ASC' },
      take: 2,
      skip: 0,
    });
    expect(asignationRepository.findAndCount).toHaveBeenNthCalledWith(3, {
      order: { id: 'ASC' },
      take: 2,
      skip: 2,
    });
  });

  it('preserves username ordering, breaks ties by id and retains list filters and pagination', async () => {
    const rows: Asignation[] = [
      asignationFixture({
        id: 'c',
        list: listFixture({ id: listId }),
        user: Object.assign(new User(), { username: 'member' }),
      }),
      asignationFixture({
        id: 'a',
        list: listFixture({ id: listId }),
        user: Object.assign(new User(), { username: 'member' }),
      }),
      asignationFixture({
        id: 'd',
        list: listFixture({ id: listId }),
        user: Object.assign(new User(), { username: 'admin' }),
      }),
      asignationFixture({
        id: 'b',
        list: listFixture({ id: listId }),
        user: Object.assign(new User(), { username: 'admin' }),
      }),
      asignationFixture({
        id: 'outside',
        list: listFixture({ id: 'another-list' }),
        user: Object.assign(new User(), { username: 'member' }),
      }),
    ];
    asignationFindAndCount.mockImplementation(
      async ({ where, order, take, skip }) => {
        expect(where).toEqual({ list: { id: listId } });
        expect(order).toEqual({ user: { username: 'ASC' }, id: 'ASC' });
        const ordered = rows
          .filter((row) => row.list.id === listId)
          .sort((left, right) => {
            const usernameOrder = left.user.username.localeCompare(
              right.user.username,
            );
            return usernameOrder || left.id.localeCompare(right.id);
          });
        return [ordered.slice(skip, skip + take), ordered.length];
      },
    );

    const firstPage = await service.findByListId(listId, {
      limit: 2,
      offset: 0,
    });
    const secondPage = await service.findByListId(listId, {
      limit: 2,
      offset: 2,
    });

    expect(firstPage).toEqual({
      totalItems: 4,
      totalPages: 2,
      currentPage: 1,
      limit: 2,
      data: [rows[3], rows[2]],
    });
    expect(secondPage).toEqual({
      totalItems: 4,
      totalPages: 2,
      currentPage: 2,
      limit: 2,
      data: [rows[1], rows[0]],
    });
    expect(
      firstPage.data
        .map(({ id }) => id)
        .filter((id) => secondPage.data.some((row) => row.id === id)),
    ).toEqual([]);
    expect(asignationRepository.findAndCount).toHaveBeenNthCalledWith(1, {
      where: { list: { id: listId } },
      order: { user: { username: 'ASC' }, id: 'ASC' },
      take: 2,
      skip: 0,
    });
    expect(asignationRepository.findAndCount).toHaveBeenNthCalledWith(2, {
      where: { list: { id: listId } },
      order: { user: { username: 'ASC' }, id: 'ASC' },
      take: 2,
      skip: 2,
    });

    asignationFindAndCount.mockResolvedValueOnce([[], 0]);
    await expect(
      service.findByListId(listId, { limit: 2, offset: 0 }),
    ).resolves.toEqual({
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      limit: 2,
      data: [],
    });

    const repositoryError = new Error('database unavailable');
    asignationFindAndCount.mockRejectedValueOnce(repositoryError);
    await expect(service.findByListId(listId, {})).rejects.toBe(
      repositoryError,
    );
  });
});
