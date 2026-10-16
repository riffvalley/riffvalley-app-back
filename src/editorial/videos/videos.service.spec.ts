import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { VideosController } from './videos.controller';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { Video, VideoStatus, VideoType } from './entities/video.entity';
import { VideosService } from './videos.service';
import { List } from 'src/editorial/lists/entities/list.entity';
import { ListCrudService } from 'src/editorial/lists/application/list-crud.service';
import { ListsService } from 'src/editorial/lists/list.service';

describe('VideosService status requirements', () => {
  const videoId = 'c17ee051-1a9b-4f33-a2b4-67f1a2508a4c';
  const userId = '96066b47-c254-4592-a526-8954c8601496';
  const editorId = 'd2342314-9a14-40c9-bcf2-006c6b927b4c';
  const updateDate = '2026-10-15T12:00:00.000Z';
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  let persistedVideo: Video;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let service: VideosService;
  let controller: VideosController;

  function video(overrides: Partial<Video> = {}): Video {
    return {
      id: videoId,
      name: 'Video editorial',
      status: VideoStatus.NOT_STARTED,
      type: VideoType.BEST,
      updateDate: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      user: undefined,
      editor: undefined,
      list: null,
      content: null,
      ...overrides,
    } as Video;
  }

  async function create(payload: Record<string, unknown>) {
    const dto = await validationPipe.transform(payload, {
      type: 'body',
      metatype: CreateVideoDto,
    });
    return controller.create(dto as CreateVideoDto);
  }

  async function update(payload: Record<string, unknown>) {
    const dto = await validationPipe.transform(payload, {
      type: 'body',
      metatype: UpdateVideoDto,
    });
    return controller.update(videoId, dto as UpdateVideoDto);
  }

  async function expectBadRequest(action: Promise<unknown>) {
    let error: unknown;
    try {
      await action;
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
  }

  beforeEach(() => {
    persistedVideo = video();
    repository = {
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn(async (entity) => {
        persistedVideo = {
          ...entity,
          id: entity.id ?? videoId,
        } as Video;
        return persistedVideo;
      }),
      findOne: jest.fn(async () => persistedVideo),
    };
    service = new VideosService(
      repository as any,
      { findOneByVideoId: jest.fn() } as any,
      { createVideoList: jest.fn() } as any,
    );
    controller = new VideosController(service);
  });

  describe('POST /videos', () => {
    it.each([
      [VideoStatus.NOT_STARTED, {}],
      [VideoStatus.IN_PROGRESS, {}],
      [VideoStatus.EDITING, { userId }],
      [VideoStatus.READY, { userId }],
      [VideoStatus.PUBLISHED, { updateDate }],
    ])(
      'accepts %s when its required fields are present',
      async (status, extra) => {
        const response = await create({
          name: 'Video editorial',
          status,
          type: VideoType.BEST,
          ...extra,
        });

        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(response).toMatchObject({
          id: videoId,
          name: 'Video editorial',
          status,
          type: VideoType.BEST,
        });
        if ('userId' in extra) {
          expect(response.user).toEqual({ id: userId });
        }
        if ('updateDate' in extra) {
          expect(response.updateDate).toEqual(new Date(updateDate));
        }
      },
    );

    it.each([VideoStatus.EDITING, VideoStatus.READY])(
      'rejects %s without a User with HTTP 400 before persistence',
      async (status) => {
        await expectBadRequest(
          create({
            name: 'Video editorial',
            status,
            type: VideoType.BEST,
          }),
        );

        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
      },
    );

    it.each([VideoStatus.EDITING, VideoStatus.READY])(
      'rejects %s with a null User with HTTP 400 before persistence',
      async (status) => {
        await expectBadRequest(
          create({
            name: 'Video editorial',
            status,
            type: VideoType.BEST,
            userId: null,
          }),
        );

        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, null])(
      'rejects published with updateDate %s with HTTP 400 before persistence',
      async (date) => {
        await expectBadRequest(
          create({
            name: 'Video editorial',
            status: VideoStatus.PUBLISHED,
            type: VideoType.BEST,
            ...(date !== undefined ? { updateDate: date } : {}),
          }),
        );

        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
      },
    );

    it('does not require an Editor for a status that requires a User', async () => {
      const response = await create({
        name: 'Video editorial',
        status: VideoStatus.EDITING,
        type: VideoType.BEST,
        userId,
      });

      expect(response.user).toEqual({ id: userId });
      expect(response.editor).toBeUndefined();
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('keeps omitted optional values empty and accepts null optional fields', async () => {
      const response = await create({
        name: 'Video editorial',
        status: VideoStatus.NOT_STARTED,
        type: VideoType.BEST,
        updateDate: null,
        userId: null,
        editorId: null,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          updateDate: null,
          user: undefined,
          editor: undefined,
        }),
      );
      expect(response.updateDate).toBeNull();
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, null])(
      'rejects missing/null status through validation before persistence',
      async (status) => {
        const payload = {
          name: 'Video editorial',
          type: VideoType.BEST,
          ...(status !== undefined ? { status } : {}),
        };

        await expectBadRequest(create(payload));
        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
      },
    );
  });

  describe('PATCH /videos/:id', () => {
    it.each([
      [VideoStatus.NOT_STARTED, VideoStatus.IN_PROGRESS, undefined, undefined],
      [VideoStatus.IN_PROGRESS, VideoStatus.EDITING, { id: userId }, undefined],
      [VideoStatus.EDITING, VideoStatus.READY, { id: userId }, undefined],
      [VideoStatus.READY, VideoStatus.PUBLISHED, undefined, updateDate],
      [VideoStatus.PUBLISHED, VideoStatus.NOT_STARTED, undefined, undefined],
    ])(
      'preserves allowed transition %s -> %s',
      async (from, to, assignedUser, date) => {
        persistedVideo = video({
          status: from,
          user: assignedUser as Video['user'],
        });

        const response = await update({
          status: to,
          ...(date ? { updateDate: date } : {}),
        });

        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(to);
        if (to === VideoStatus.PUBLISHED) {
          expect(response.updateDate).toEqual(new Date(updateDate));
        }
      },
    );

    it('allows assigning a User in the same update that changes status', async () => {
      const response = await update({
        status: VideoStatus.READY,
        userId,
      });

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(VideoStatus.READY);
      expect(response.user).toEqual({ id: userId });
    });

    it('clears User with explicit null when the resulting status allows it', async () => {
      persistedVideo = video({
        status: VideoStatus.EDITING,
        user: { id: userId } as Video['user'],
      });

      const response = await update({
        status: VideoStatus.IN_PROGRESS,
        userId: null,
      });

      expect(response.status).toBe(VideoStatus.IN_PROGRESS);
      expect(response.user).toBeNull();
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('clears Editor with explicit null in any status', async () => {
      persistedVideo = video({
        status: VideoStatus.EDITING,
        user: { id: userId } as Video['user'],
        editor: { id: editorId } as Video['editor'],
      });

      const response = await update({ editorId: null });

      expect(response.status).toBe(VideoStatus.EDITING);
      expect(response.editor).toBeNull();
      expect(response.user).toEqual({ id: userId });
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it.each([VideoStatus.EDITING, VideoStatus.READY])(
      'rejects clearing User while the resulting status is %s before persistence',
      async (status) => {
        persistedVideo = video({
          status,
          user: { id: userId } as Video['user'],
        });

        await expectBadRequest(update({ userId: null }));
        expect(repository.save).not.toHaveBeenCalled();
      },
    );

    it('validates simultaneous status and User changes against the resulting values', async () => {
      persistedVideo = video({
        status: VideoStatus.EDITING,
        user: { id: userId } as Video['user'],
      });

      await expectBadRequest(
        update({ status: VideoStatus.READY, userId: null }),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('preserves User and Editor when their fields are omitted', async () => {
      persistedVideo = video({
        user: { id: userId } as Video['user'],
        editor: { id: editorId } as Video['editor'],
      });

      const response = await update({ name: 'Updated name' });

      expect(response.user).toEqual({ id: userId });
      expect(response.editor).toEqual({ id: editorId });
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('accepts valid User and Editor UUIDs together', async () => {
      const response = await update({ userId, editorId });

      expect(response.user).toEqual({ id: userId });
      expect(response.editor).toEqual({ id: editorId });
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it.each([VideoStatus.EDITING, VideoStatus.READY])(
      'rejects transition to %s without a User before persistence',
      async (status) => {
        persistedVideo = video();

        await expectBadRequest(update({ status }));
        expect(repository.save).not.toHaveBeenCalled();
      },
    );

    it('rejects transition to published without a newly provided updateDate', async () => {
      persistedVideo = video({
        status: VideoStatus.READY,
        updateDate: new Date(updateDate),
      });

      await expectBadRequest(update({ status: VideoStatus.PUBLISHED }));
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('does not revalidate an unchanged published status', async () => {
      persistedVideo = video({
        status: VideoStatus.PUBLISHED,
        updateDate: null,
      });

      const response = await update({ status: VideoStatus.PUBLISHED });

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(VideoStatus.PUBLISHED);
      expect(response.updateDate).toBeNull();
    });

    it('keeps omitted and null status/date unchanged on PATCH', async () => {
      const originalDate = new Date(updateDate);
      persistedVideo = video({ updateDate: originalDate });

      const omittedStatus = await update({ name: 'Renamed' });
      expect(omittedStatus.status).toBe(VideoStatus.NOT_STARTED);
      expect(omittedStatus.updateDate).toEqual(originalDate);

      const nullFields = await update({ status: null, updateDate: null });
      expect(nullFields.status).toBe(VideoStatus.NOT_STARTED);
      expect(nullFields.updateDate).toEqual(originalDate);
      expect(repository.save).toHaveBeenCalledTimes(2);
    });
  });
});

describe('VideosService relation references', () => {
  const videoId = 'c17ee051-1a9b-4f33-a2b4-67f1a2508a4c';
  const userId = '96066b47-c254-4592-a526-8954c8601496';
  const editorId = 'd2342314-9a14-40c9-bcf2-006c6b927b4c';
  const listId = '1bf4dfb7-1b9c-4dc9-97c6-a8a05e06e7b9';
  const knownConstraints = {
    userId: 'FK_74e27b13f8ac66f999400df12f6',
    editorId: 'FK_326eb34c48fc181639511958a19',
    listId: 'FK_e7181db8200f878e3ba5fb2486c',
  };
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let service: VideosService;
  let controller: VideosController;

  const video = (overrides: Partial<Video> = {}): Video =>
    ({
      id: videoId,
      name: 'Video editorial',
      status: VideoStatus.NOT_STARTED,
      type: VideoType.BEST,
      updateDate: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      user: undefined,
      editor: undefined,
      list: null,
      content: null,
      ...overrides,
    }) as Video;

  const foreignKeyError = (
    constraint: string,
    table = 'video',
    code = '23503',
  ) => {
    const driverError = Object.assign(new Error('private database detail'), {
      code,
      table,
      constraint,
      detail: 'private SQL and row detail',
    });
    return new QueryFailedError('INSERT INTO video ...', [], driverError);
  };

  async function create(payload: Record<string, unknown>) {
    const dto = await validationPipe.transform(payload, {
      type: 'body',
      metatype: CreateVideoDto,
    });
    return controller.create(dto as CreateVideoDto);
  }

  async function update(payload: Record<string, unknown>) {
    const dto = await validationPipe.transform(payload, {
      type: 'body',
      metatype: UpdateVideoDto,
    });
    return controller.update(videoId, dto as UpdateVideoDto);
  }

  beforeEach(() => {
    repository = {
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn(async (entity) => ({ ...entity, id: videoId })),
      findOne: jest.fn(async () => video()),
    };
    service = new VideosService(
      repository as any,
      { findOneByVideoId: jest.fn() } as any,
      { createVideoList: jest.fn() } as any,
    );
    controller = new VideosController(service);
  });

  it('creates with valid User, Editor, and List references in one write', async () => {
    const result = await create({
      name: 'Video editorial',
      status: VideoStatus.NOT_STARTED,
      type: VideoType.BEST,
      userId,
      editorId,
      listId,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: userId },
        editor: { id: editorId },
        list: { id: listId },
      }),
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.findOne).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(videoId);
  });

  it.each([
    ['User', 'userId', knownConstraints.userId],
    ['Editor', 'editorId', knownConstraints.editorId],
    ['List', 'listId', knownConstraints.listId],
  ])(
    'returns HTTP 404 when creation references a missing %s',
    async (_, field, constraint) => {
      repository.save.mockRejectedValueOnce(foreignKeyError(constraint));

      let error: unknown;
      try {
        await create({
          name: 'Video editorial',
          status: VideoStatus.NOT_STARTED,
          type: VideoType.BEST,
          [field]: userId,
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(404);
      expect((error as NotFoundException).message).toBe(
        'One or more referenced resources were not found',
      );
      expect((error as Error).message).not.toContain('FK_');
      expect((error as Error).message).not.toContain('INSERT');
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.findOne).not.toHaveBeenCalled();
    },
  );

  it('updates valid User, Editor, and List references in one write', async () => {
    const result = await update({ userId, editorId, listId });

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: userId },
        editor: { id: editorId },
        list: { id: listId },
      }),
    );
    expect(repository.findOne).toHaveBeenCalledTimes(2);
    expect(result.id).toBe(videoId);
  });

  it.each([
    ['User', 'userId', knownConstraints.userId],
    ['Editor', 'editorId', knownConstraints.editorId],
    ['List', 'listId', knownConstraints.listId],
  ])(
    'returns HTTP 404 when update references a missing %s',
    async (_, field, constraint) => {
      repository.save.mockRejectedValueOnce(foreignKeyError(constraint));

      await expect(update({ [field]: userId })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.findOne).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps create nulls empty and clears explicit User/Editor nulls on update', async () => {
    const created = await create({
      name: 'Video editorial',
      status: VideoStatus.NOT_STARTED,
      type: VideoType.BEST,
      userId: null,
      editorId: null,
      listId: null,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: undefined,
        editor: undefined,
        list: undefined,
      }),
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(created.id).toBe(videoId);

    repository.create.mockClear();
    repository.save.mockClear();
    repository.findOne.mockClear();
    const updated = await update({
      userId: null,
      editorId: null,
      listId: null,
    });

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user: null,
        editor: null,
        list: null,
      }),
    );
    expect(repository.findOne).toHaveBeenCalledTimes(2);
    expect(updated.id).toBe(videoId);
  });

  it('keeps omitted relation fields unchanged on update', async () => {
    const originalUser = { id: userId } as Video['user'];
    const originalEditor = { id: editorId } as Video['editor'];
    const originalList = { id: listId } as Video['list'];
    repository.findOne.mockResolvedValue(
      video({ user: originalUser, editor: originalEditor, list: originalList }),
    );

    await update({ name: 'Renamed' });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user: originalUser,
        editor: originalEditor,
        list: originalList,
      }),
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('keeps invalid UUIDs as HTTP 400 before writing', async () => {
    await expect(
      create({
        name: 'Video editorial',
        status: VideoStatus.NOT_STARTED,
        type: VideoType.BEST,
        userId: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(update({ listId: 'not-a-uuid' })).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown constraint', foreignKeyError('FK_unrelated')],
    ['other table', foreignKeyError(knownConstraints.userId, 'content')],
    [
      'other SQLSTATE',
      foreignKeyError(knownConstraints.userId, 'video', '23505'),
    ],
  ])('propagates FK-shaped errors with %s', async (_, error) => {
    repository.save.mockRejectedValueOnce(error);

    await expect(
      create({
        name: 'Video editorial',
        status: VideoStatus.NOT_STARTED,
        type: VideoType.BEST,
        userId,
      }),
    ).rejects.toBe(error);
  });

  it('propagates unrelated repository failures unchanged', async () => {
    const error = new Error('unexpected persistence failure');
    repository.save.mockRejectedValueOnce(error);

    await expect(update({ userId })).rejects.toBe(error);
  });
});

describe('VideosService VIDEO list transaction', () => {
  const videoId = 'c17ee051-1a9b-4f33-a2b4-67f1a2508a4c';
  const listId = '1bf4dfb7-1b9c-4dc9-97c6-a8a05e06e7b9';

  const makeVideo = (overrides: Partial<Video> = {}): Video =>
    ({
      id: videoId,
      name: 'Video editorial',
      status: VideoStatus.NOT_STARTED,
      type: VideoType.BEST,
      updateDate: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      user: undefined,
      editor: undefined,
      list: null,
      content: null,
      ...overrides,
    }) as Video;

  function makeHarness(
    options: {
      initialVideo?: Video | null;
      listSaveError?: Error;
      videoSaveError?: Error;
    } = {},
  ) {
    let committedVideo =
      options.initialVideo === undefined
        ? makeVideo()
        : options.initialVideo
          ? { ...options.initialVideo }
          : null;
    let committedLists: List[] = [];
    const transactionContexts: Array<{
      manager: { getRepository: jest.Mock };
      videoRepository: { findOne: jest.Mock; save: jest.Mock };
      listRepository: { create: jest.Mock; save: jest.Mock };
    }> = [];
    const baseListRepository = {
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn(async (entity) => entity),
    };
    const listCrudService = new ListCrudService(baseListRepository as any);
    const listsService = new ListsService(
      listCrudService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const videoRepository: any = {
      create: jest.fn((values) => ({ ...values })),
      save: jest.fn(),
      findOne: jest.fn(async () => committedVideo),
      manager: {
        transaction: jest.fn(async (callback) => {
          const transactionState = {
            video: committedVideo ? { ...committedVideo } : null,
            lists: [...committedLists],
          };
          const transactionListRepository = {
            create: jest.fn((values) => ({ ...values, id: listId })),
            save: jest.fn(async (entity) => {
              if (options.listSaveError) throw options.listSaveError;
              transactionState.lists.push(entity);
              return entity;
            }),
          };
          const transactionVideoRepository = {
            findOne: jest.fn(async () =>
              transactionState.video ? { ...transactionState.video } : null,
            ),
            save: jest.fn(async (entity) => {
              if (options.videoSaveError) throw options.videoSaveError;
              transactionState.video = { ...entity };
              return transactionState.video;
            }),
          };
          const manager = {
            getRepository: jest.fn((entity) =>
              entity === Video
                ? transactionVideoRepository
                : transactionListRepository,
            ),
          };
          transactionContexts.push({
            manager,
            videoRepository: transactionVideoRepository,
            listRepository: transactionListRepository,
          });

          const result = await callback(manager);
          committedVideo = transactionState.video;
          committedLists = transactionState.lists;
          return result;
        }),
      },
    };
    const service = new VideosService(
      videoRepository,
      { findOneByVideoId: jest.fn() } as any,
      listsService,
    );

    return {
      service,
      videoRepository,
      baseListRepository,
      transactionContexts,
      getCommittedVideo: () => committedVideo,
      getCommittedLists: () => committedLists,
    };
  }

  it('creates and links the VIDEO List through the same transaction manager', async () => {
    const harness = makeHarness();

    const result = await harness.service.createListForVideo(videoId);

    const context = harness.transactionContexts[0];
    expect(harness.videoRepository.manager.transaction).toHaveBeenCalledTimes(
      1,
    );
    expect(context.manager.getRepository).toHaveBeenCalledWith(Video);
    expect(context.manager.getRepository).toHaveBeenCalledWith(List);
    expect(context.videoRepository.findOne).toHaveBeenCalledWith({
      where: { id: videoId },
      relations: ['list'],
      lock: { mode: 'pessimistic_write', tables: ['video'] },
    });
    expect(context.listRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Video editorial', type: 'video' }),
    );
    expect(context.listRepository.save).toHaveBeenCalledTimes(1);
    expect(context.videoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        list: expect.objectContaining({ id: listId }),
      }),
    );
    expect(harness.baseListRepository.create).not.toHaveBeenCalled();
    expect(harness.baseListRepository.save).not.toHaveBeenCalled();
    expect(harness.videoRepository.save).not.toHaveBeenCalled();
    expect(harness.getCommittedLists()).toHaveLength(1);
    expect(harness.getCommittedVideo()).toEqual(
      expect.objectContaining({
        list: expect.objectContaining({ id: listId }),
      }),
    );
    expect(result.list).toEqual(expect.objectContaining({ id: listId }));
  });

  it('does not modify Video when creating the List fails', async () => {
    const error = new Error('list persistence failed');
    const harness = makeHarness({ listSaveError: error });

    await expect(
      harness.service.createListForVideo(videoId),
    ).rejects.toMatchObject({
      status: 500,
      message: 'An unexpected error occurred',
    });

    const context = harness.transactionContexts[0];
    expect(context.listRepository.save).toHaveBeenCalledTimes(1);
    expect(context.videoRepository.save).not.toHaveBeenCalled();
    expect(harness.getCommittedLists()).toHaveLength(0);
    expect(harness.getCommittedVideo()?.list).toBeNull();
    expect(harness.videoRepository.findOne).not.toHaveBeenCalled();
  });

  it('rolls back the created List when saving Video fails', async () => {
    const error = new Error('video link persistence failed');
    const harness = makeHarness({ videoSaveError: error });

    await expect(harness.service.createListForVideo(videoId)).rejects.toBe(
      error,
    );

    const context = harness.transactionContexts[0];
    expect(context.listRepository.save).toHaveBeenCalledTimes(1);
    expect(context.videoRepository.save).toHaveBeenCalledTimes(1);
    expect(harness.getCommittedLists()).toHaveLength(0);
    expect(harness.getCommittedVideo()?.list).toBeNull();
    expect(harness.videoRepository.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing Video without creating a List', async () => {
    const harness = makeHarness({ initialVideo: null });

    await expect(
      harness.service.createListForVideo(videoId),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Video not found',
    });

    const context = harness.transactionContexts[0];
    expect(context.listRepository.create).not.toHaveBeenCalled();
    expect(context.listRepository.save).not.toHaveBeenCalled();
    expect(context.videoRepository.save).not.toHaveBeenCalled();
    expect(harness.getCommittedLists()).toHaveLength(0);
  });

  it('keeps the existing 400 response and avoids duplicates when Video already has a List', async () => {
    const existingList = { id: listId } as List;
    const harness = makeHarness({
      initialVideo: makeVideo({ list: existingList }),
    });

    await expect(
      harness.service.createListForVideo(videoId),
    ).rejects.toMatchObject({ status: 400 });

    const context = harness.transactionContexts[0];
    expect(context.listRepository.create).not.toHaveBeenCalled();
    expect(context.listRepository.save).not.toHaveBeenCalled();
    expect(context.videoRepository.save).not.toHaveBeenCalled();
    expect(harness.getCommittedLists()).toHaveLength(0);
    expect(harness.getCommittedVideo()?.list).toEqual(existingList);
  });

  it('propagates unexpected transaction errors unchanged', async () => {
    const error = new Error('transaction failed unexpectedly');
    const harness = makeHarness();
    harness.videoRepository.manager.transaction.mockRejectedValueOnce(error);

    await expect(harness.service.createListForVideo(videoId)).rejects.toBe(
      error,
    );
    expect(harness.videoRepository.findOne).not.toHaveBeenCalled();
  });
});
