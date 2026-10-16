import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AsignationsService } from './asignations.service';
import { Asignation } from './entities/asignations.entity';
import { List } from '../entities/list.entity';

jest.mock('sanitize-html', () => jest.fn((value: string) => value));

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
  let asignationRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    preload: jest.Mock;
    delete: jest.Mock;
    findAndCount: jest.Mock;
    manager: { transaction: jest.Mock };
    findOne: jest.Mock;
    query: jest.Mock;
  };
  let userRepository: { findOneBy: jest.Mock };
  let discRepository: { findOneBy: jest.Mock };
  let listRepository: { findOneBy: jest.Mock };
  let listsService: { syncDiscToWordPress: jest.Mock };
  let groupCount = 0;
  let transactionManager: any;

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

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getStatus()).toBe(404);
    return error as NotFoundException;
  }

  beforeEach(() => {
    groupCount = 0;
    asignationRepository = {
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn(async (asignation) => asignation),
      findOneBy: jest.fn(async () => ({ id: asignationId })),
      preload: jest.fn(async () => ({ id: asignationId })),
      delete: jest.fn(async () => ({ affected: 1 })),
      findAndCount: jest.fn(async () => [[], 0]),
      findOne: jest.fn(async () => ({
        id: asignationId,
        list: { id: listId, type: 'week' },
        position: 2,
        disc: { id: discId },
      })),
      query: jest.fn(async () => [{ count: groupCount }]),
      manager: {
        transaction: jest.fn(async (callback) => callback(transactionManager)),
      },
    };
    userRepository = { findOneBy: jest.fn(async () => ({ id: userId })) };
    discRepository = { findOneBy: jest.fn(async () => ({ id: discId })) };
    listRepository = {
      findOneBy: jest.fn(async () => ({ id: listId, type: 'week' })),
    };
    transactionManager = {
      query: jest.fn(),
      getRepository: jest.fn((entity) =>
        entity === List ? listRepository : asignationRepository,
      ),
    };
    listsService = { syncDiscToWordPress: jest.fn() };
    service = new AsignationsService(
      asignationRepository as any,
      userRepository as any,
      discRepository as any,
      listRepository as any,
      listsService as any,
    );
    (service as any).logger.error = jest.fn();
  });

  it('returns an existing asignation without changing its payload', async () => {
    const existing = { id: asignationId, position: 2 } as Asignation;
    asignationRepository.findOneBy.mockResolvedValue(existing);

    await expect(service.findOne(asignationId)).resolves.toBe(existing);
    expect(asignationRepository.findOneBy).toHaveBeenCalledWith({
      id: asignationId,
    });
  });

  it('returns 404 for a missing asignation and propagates repository failures', async () => {
    asignationRepository.findOneBy.mockResolvedValueOnce(null);
    const notFound = await expectNotFound(service.findOne(asignationId));
    expect(notFound.message).toBe(
      `Asignation with id ${asignationId} not found`,
    );

    const repositoryError = new Error('database unavailable');
    asignationRepository.findOneBy.mockRejectedValueOnce(repositoryError);
    await expect(service.findOne(asignationId)).rejects.toBe(repositoryError);
  });

  it('creates with valid related records and preserves the response', async () => {
    const created = { position: 2 };
    const saved = { id: asignationId, position: 2 };
    asignationRepository.create.mockReturnValue(created);
    asignationRepository.save.mockResolvedValue(saved);

    const result = await service.create({
      listId,
      userId,
      discId,
      position: 2,
    });

    expect(result).toBe(created);
    expect(asignationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: userId },
        disc: { id: discId },
        list: expect.objectContaining({ id: listId }),
        position: 2,
      }),
    );
  });

  it('allows the first and fourth Radar discs, rejects the fifth without saving', async () => {
    listRepository.findOneBy.mockResolvedValue({ id: listId, type: 'week' });
    await expect(
      service.create({ listId, discId, position: 0 }),
    ).resolves.toBeDefined();
    expect(asignationRepository.query).not.toHaveBeenCalled();

    const createAt = (position: number) =>
      service.create({ listId, discId, position });

    groupCount = 0;
    await expect(createAt(1)).resolves.toBeDefined();
    groupCount = 3;
    await expect(createAt(1)).resolves.toBeDefined();
    groupCount = 4;
    const previousSaves = asignationRepository.save.mock.calls.length;
    await expect(createAt(1)).rejects.toMatchObject({
      status: 400,
      message: 'Un grupo de Radar admite como máximo cuatro discos.',
    });
    expect(asignationRepository.save).toHaveBeenCalledTimes(previousSaves);
  });

  it('limits nonzero negative positions as groups too', async () => {
    listRepository.findOneBy.mockResolvedValue({ id: listId, type: 'week' });
    groupCount = 4;

    await expect(
      service.create({ listId, discId, position: -1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['SPECIAL', 'special'],
    ['MONTH', 'month'],
  ])('does not apply the cap to %s lists', async (_name, type) => {
    listRepository.findOneBy.mockResolvedValue({ id: listId, type });
    groupCount = 9;
    await expect(
      service.create({ listId, discId, position: 1 }),
    ).resolves.toBeDefined();
    expect(asignationRepository.query).not.toHaveBeenCalled();
  });

  it('takes a transaction-scoped advisory lock before counting and saving', async () => {
    listRepository.findOneBy.mockResolvedValue({ id: listId, type: 'week' });
    await service.create({ listId, discId, position: 3 });

    expect(transactionManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`riffvalley:radar-group:${listId}:3`],
    );
    expect(transactionManager.query.mock.invocationCallOrder[0]).toBeLessThan(
      asignationRepository.query.mock.invocationCallOrder[0],
    );
  });

  it('propagates unexpected create repository failures', async () => {
    const repositoryError = new Error('database unavailable');
    listRepository.findOneBy.mockRejectedValue(repositoryError);

    await expect(service.create({ listId })).rejects.toBe(repositoryError);
  });

  it.each([
    ['list', listId],
    ['user', userId],
    ['disc', discId],
  ])(
    'returns 404 when the referenced %s does not exist',
    async (relation, id) => {
      if (relation === 'list') listRepository.findOneBy.mockResolvedValue(null);
      if (relation === 'user') userRepository.findOneBy.mockResolvedValue(null);
      if (relation === 'disc') discRepository.findOneBy.mockResolvedValue(null);

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
      asignationRepository.save.mockRejectedValue(databaseError);

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
      asignationRepository.save.mockRejectedValue(foreignKeyError);

      await expect(service.create({ listId })).rejects.toBe(foreignKeyError);
    },
  );

  it('preserves the existing 400 status for unique violations without exposing driver detail', async () => {
    const databaseError = queryFailedError('23505', {
      table: 'asignation',
      constraint: 'UQ_private_name',
    });
    asignationRepository.save.mockRejectedValue(databaseError);

    let error: unknown;
    try {
      await service.create({ listId });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).message).toBe(
      'Asignation conflicts with existing data',
    );
    expect((error as BadRequestException).message).not.toContain(
      'UQ_private_name',
    );
  });

  it('returns 404 when update cannot preload the requested asignation', async () => {
    asignationRepository.findOne.mockResolvedValue(null);

    await expectNotFound(service.update(asignationId, { done: true }));
    expect(asignationRepository.save).not.toHaveBeenCalled();
  });

  it('updates an existing asignation with a valid user and preserves the response', async () => {
    asignationRepository.preload.mockImplementation(async (values) => ({
      ...values,
    }));

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
    asignationRepository.preload.mockImplementation(async (values) => ({
      ...values,
    }));
    await expect(
      service.update(asignationId, { done: true }),
    ).resolves.toBeDefined();
    expect(asignationRepository.save).toHaveBeenCalled();

    asignationRepository.findOne.mockResolvedValueOnce({
      id: asignationId,
      list: { id: listId, type: 'week' },
      position: 1,
      disc: { id: discId },
    });
    groupCount = 2;
    await expect(
      service.update(asignationId, { position: 2 }),
    ).resolves.toBeDefined();
    expect(transactionManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`riffvalley:radar-group:${listId}:1`],
    );
    expect(transactionManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`riffvalley:radar-group:${listId}:2`],
    );
  });

  it('rejects movement into a full group and preserves the existing assignment', async () => {
    asignationRepository.findOne.mockResolvedValue({
      id: asignationId,
      list: { id: listId, type: 'week' },
      position: 1,
      disc: { id: discId },
    });
    groupCount = 4;
    asignationRepository.save.mockClear();

    await expect(
      service.update(asignationId, { position: 2 }),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(asignationRepository.save).not.toHaveBeenCalled();
  });

  it('does not apply the cap to update destinations outside WEEK lists', async () => {
    listRepository.findOneBy.mockResolvedValue({ id: listId, type: 'special' });
    asignationRepository.findOne.mockResolvedValue({
      id: asignationId,
      list: { id: listId, type: 'special' },
      position: 1,
      disc: { id: discId },
    });
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
    asignationRepository.save.mockRejectedValueOnce(userForeignKeyError);
    await expectNotFound(service.update(asignationId, { userId }));

    const repositoryError = new Error('database unavailable');
    asignationRepository.save.mockRejectedValueOnce(repositoryError);
    await expect(service.update(asignationId, { done: true })).rejects.toBe(
      repositoryError,
    );
  });

  it('returns 404 when delete affects no asignation and preserves successful delete response', async () => {
    asignationRepository.delete.mockResolvedValueOnce({ affected: 0 });
    await expectNotFound(service.remove(asignationId));

    asignationRepository.delete.mockResolvedValueOnce({ affected: 1 });
    await expect(service.remove(asignationId)).resolves.toEqual({
      message: `Asignation with id ${asignationId} has been removed`,
    });
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

    const rows = [
      { id: 'c', list: { id: listId } },
      { id: 'a', list: { id: listId } },
      { id: 'd', list: { id: listId } },
      { id: 'b', list: { id: listId } },
    ];
    asignationRepository.findAndCount.mockImplementation(
      async ({ order, take, skip }) => {
        expect(order).toEqual({ id: 'ASC' });
        const ordered = [...rows].sort((left, right) =>
          left.id.localeCompare(right.id),
        );
        return [ordered.slice(skip, skip + take), rows.length];
      },
    );

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
    const rows = [
      { id: 'c', list: { id: listId }, user: { username: 'member' } },
      { id: 'a', list: { id: listId }, user: { username: 'member' } },
      { id: 'd', list: { id: listId }, user: { username: 'admin' } },
      { id: 'b', list: { id: listId }, user: { username: 'admin' } },
      {
        id: 'outside',
        list: { id: 'another-list' },
        user: { username: 'member' },
      },
    ];
    asignationRepository.findAndCount.mockImplementation(
      async ({ where, order, take, skip }) => {
        expect(where).toEqual({ list: { id: listId } });
        expect(order).toEqual({ user: { username: 'ASC' }, id: 'ASC' });
        const ordered = rows
          .filter((row) => row.list.id === where.list.id)
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

    asignationRepository.findAndCount.mockResolvedValueOnce([[], 0]);
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
    asignationRepository.findAndCount.mockRejectedValueOnce(repositoryError);
    await expect(service.findByListId(listId, {})).rejects.toBe(
      repositoryError,
    );
  });
});
