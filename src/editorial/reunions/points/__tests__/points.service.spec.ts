import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
} from 'typeorm';
import { Reunion } from 'src/editorial/reunions/entities/reunion.entity';
import { Point } from '../entities/point.entity';
import { CreatePointDto } from '../dto/create-points.dto';
import { UpdatePointDto } from '../dto/update-point.dto';
import { PointService } from '../points.service';
import { ReunionsEventPublisher } from '../../realtime/reunions-event-publisher.service';

type PointRepositoryMock = {
  create: jest.Mock<Point, [DeepPartial<Point>]>;
  save: jest.Mock<Promise<Point>, [Point]>;
  find: jest.Mock<Promise<Point[]>, [FindManyOptions<Point>?]>;
  findOne: jest.Mock<Promise<Point | null>, [FindOneOptions<Point>]>;
  delete: jest.Mock<Promise<DeleteResult>, [string]>;
};

type ReunionRepositoryMock = {
  findOne: jest.Mock<Promise<Reunion | null>, [FindOneOptions<Reunion>]>;
};

const makeReunion = (id = 'reunion-id'): Reunion => ({
  id,
  titulo: 'Weekly reunion',
  fecha: new Date('2026-10-21T18:00:00.000Z'),
  points: [],
  createdAt: new Date('2026-10-20T00:00:00.000Z'),
  updatedAt: new Date('2026-10-20T00:00:00.000Z'),
});

const makePoint = (
  overrides: Partial<Point> = {},
  reunion = makeReunion(),
): Point => ({
  id: 'point-id',
  titulo: 'Task',
  content: '',
  reunion,
  createdAt: new Date('2026-10-20T00:00:00.000Z'),
  done: false,
  ...overrides,
});

describe('PointService', () => {
  const makeFixture = async () => {
    const pointRepository: PointRepositoryMock = {
      create: jest.fn<Point, [DeepPartial<Point>]>(),
      save: jest.fn<Promise<Point>, [Point]>((point) => Promise.resolve(point)),
      find: jest.fn<Promise<Point[]>, [FindManyOptions<Point>?]>(),
      findOne: jest.fn<Promise<Point | null>, [FindOneOptions<Point>]>(),
      delete: jest.fn<Promise<DeleteResult>, [string]>(),
    };
    const reunionRepository: ReunionRepositoryMock = {
      findOne: jest.fn<Promise<Reunion | null>, [FindOneOptions<Reunion>]>(),
    };
    const reunionsEventPublisher = { publishChangeSafely: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PointService,
        { provide: getRepositoryToken(Point), useValue: pointRepository },
        { provide: getRepositoryToken(Reunion), useValue: reunionRepository },
        { provide: ReunionsEventPublisher, useValue: reunionsEventPublisher },
      ],
    }).compile();

    return {
      service: moduleRef.get(PointService),
      pointRepository,
      reunionRepository,
      reunionsEventPublisher,
      moduleRef,
    };
  };

  it('validates Reunion and saves a Point associated with it', async () => {
    const fixture = await makeFixture();
    const reunion = makeReunion();
    const dto: CreatePointDto = {
      titulo: 'Assign weekly radar',
      reunionId: reunion.id,
      content: '',
      done: false,
    };
    const saved = makePoint({ titulo: dto.titulo }, reunion);
    fixture.reunionRepository.findOne.mockResolvedValueOnce(reunion);
    fixture.pointRepository.create.mockReturnValueOnce(saved);
    fixture.pointRepository.save.mockResolvedValueOnce(saved);

    await expect(fixture.service.createPoint(dto)).resolves.toBe(saved);
    expect(fixture.reunionRepository.findOne).toHaveBeenCalledWith({
      where: { id: reunion.id },
    });
    expect(fixture.pointRepository.create).toHaveBeenCalledWith({
      titulo: dto.titulo,
      content: dto.content,
      done: dto.done,
      reunion,
    });
    expect(fixture.pointRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ reunion }),
    );
    expect(
      fixture.reunionsEventPublisher.publishChangeSafely,
    ).toHaveBeenCalledTimes(1);
    await fixture.moduleRef.close();
  });

  it('returns 404 and does not save when the Reunion reference is missing', async () => {
    const fixture = await makeFixture();
    fixture.reunionRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      fixture.service.createPoint({
        titulo: 'Task',
        reunionId: 'missing-id',
      }),
    ).rejects.toThrow(
      new NotFoundException('Reunion with ID missing-id not found'),
    );
    expect(fixture.pointRepository.create).not.toHaveBeenCalled();
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
    await fixture.moduleRef.close();
  });

  it('lists Points with Reunion and loads Reunion on findOne', async () => {
    const fixture = await makeFixture();
    const points = [makePoint()];
    fixture.pointRepository.find.mockResolvedValueOnce(points);
    fixture.pointRepository.findOne.mockResolvedValueOnce(points[0]);

    await expect(fixture.service.findAll()).resolves.toBe(points);
    expect(fixture.pointRepository.find).toHaveBeenCalledWith({
      relations: ['reunion'],
    });
    await expect(fixture.service.findOne('point-id')).resolves.toBe(points[0]);
    expect(fixture.pointRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'point-id' },
      relations: ['reunion'],
    });
    await fixture.moduleRef.close();
  });

  it('returns 404 when findOne cannot locate a Point', async () => {
    const fixture = await makeFixture();
    fixture.pointRepository.findOne.mockResolvedValueOnce(null);

    await expect(fixture.service.findOne('missing-id')).rejects.toThrow(
      new NotFoundException('Point with ID missing-id not found'),
    );
    await fixture.moduleRef.close();
  });

  it('updates supplied fields and preserves the Reunion when reunionId is omitted', async () => {
    const fixture = await makeFixture();
    const originalReunion = makeReunion('original-reunion-id');
    const point = makePoint({ titulo: 'Old title' }, originalReunion);
    const update: UpdatePointDto = { titulo: 'New title' };
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);

    await expect(fixture.service.updatePoint('point-id', update)).resolves.toBe(
      point,
    );

    expect(point.titulo).toBe('New title');
    expect(point.reunion).toBe(originalReunion);
    expect(fixture.pointRepository.save).toHaveBeenCalledWith(point);
    expect(fixture.reunionRepository.findOne).not.toHaveBeenCalled();
    expect(
      fixture.reunionsEventPublisher.publishChangeSafely,
    ).toHaveBeenCalledTimes(1);
    await fixture.moduleRef.close();
  });

  it.each([
    [{ titulo: 'Updated title' }, 'titulo', 'Updated title'],
    [{ content: 'Updated notes' }, 'content', 'Updated notes'],
    [{ done: true }, 'done', true],
  ] as const)(
    'updates Point field %s and returns the saved Point with its Reunion',
    async (update, field, value) => {
      const fixture = await makeFixture();
      const reunion = makeReunion();
      const point = makePoint({}, reunion);
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);
      fixture.pointRepository.save.mockResolvedValueOnce(point);

      await expect(
        fixture.service.updatePoint('point-id', update),
      ).resolves.toBe(point);

      expect(point).toMatchObject({ [field]: value, reunion });
      expect(fixture.pointRepository.save).toHaveBeenCalledWith(point);
      expect(
        fixture.reunionsEventPublisher.publishChangeSafely,
      ).toHaveBeenCalledTimes(1);
      await fixture.moduleRef.close();
    },
  );

  it('saves an update that makes no effective changes', async () => {
    const fixture = await makeFixture();
    const point = makePoint({ titulo: 'Unchanged title', done: false });
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);
    fixture.reunionRepository.findOne.mockResolvedValueOnce(point.reunion);
    fixture.pointRepository.save.mockResolvedValueOnce(point);

    await expect(
      fixture.service.updatePoint('point-id', { titulo: 'Unchanged title' }),
    ).resolves.toBe(point);

    expect(fixture.pointRepository.save).toHaveBeenCalledWith(point);
    expect(
      fixture.reunionsEventPublisher.publishChangeSafely,
    ).not.toHaveBeenCalled();
    await fixture.moduleRef.close();
  });

  it('reassigns a Point to an existing Reunion', async () => {
    const fixture = await makeFixture();
    const originalReunion = makeReunion('original-reunion-id');
    const destination = makeReunion('destination-reunion-id');
    const point = makePoint({}, originalReunion);
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);
    fixture.reunionRepository.findOne.mockResolvedValueOnce(destination);
    fixture.pointRepository.save.mockResolvedValueOnce(
      makePoint({}, destination),
    );

    const result = await fixture.service.updatePoint('point-id', {
      reunionId: destination.id,
    });

    expect(fixture.reunionRepository.findOne).toHaveBeenCalledWith({
      where: { id: destination.id },
    });
    expect(fixture.pointRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ reunion: destination }),
    );
    expect(point.reunion).toBe(destination);
    expect(result.reunion).toBe(destination);
    expect(result).not.toHaveProperty('reunionId');
    await fixture.moduleRef.close();
  });

  it('returns 404 and does not save when the destination Reunion is missing', async () => {
    const fixture = await makeFixture();
    const point = makePoint({}, makeReunion('original-reunion-id'));
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);
    fixture.reunionRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      fixture.service.updatePoint('point-id', {
        reunionId: 'missing-reunion-id',
      }),
    ).rejects.toThrow(
      new NotFoundException('Reunion with ID missing-reunion-id not found'),
    );
    expect(point.reunion).toEqual(makeReunion('original-reunion-id'));
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
    await fixture.moduleRef.close();
  });

  it('rejects null reunionId instead of querying with an empty reference', async () => {
    const fixture = await makeFixture();
    const point = makePoint();
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);

    await expect(
      fixture.service.updatePoint(
        'point-id',
        Object.assign(new UpdatePointDto(), { reunionId: null }),
      ),
    ).rejects.toThrow('reunionId must be a UUID v4');
    expect(fixture.reunionRepository.findOne).not.toHaveBeenCalled();
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
    await fixture.moduleRef.close();
  });

  it('returns 404 when updating a Point that does not exist', async () => {
    const fixture = await makeFixture();
    jest
      .spyOn(fixture.service, 'findOne')
      .mockRejectedValueOnce(
        new NotFoundException('Point with ID missing-id not found'),
      );

    await expect(
      fixture.service.updatePoint('missing-id', { done: true }),
    ).rejects.toThrow(
      new NotFoundException('Point with ID missing-id not found'),
    );
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
    await fixture.moduleRef.close();
  });

  it('deletes a Point and returns 404 when no row was affected', async () => {
    const fixture = await makeFixture();
    fixture.pointRepository.delete
      .mockResolvedValueOnce({ affected: 1, raw: [] })
      .mockResolvedValueOnce({ affected: 0, raw: [] });

    await expect(
      fixture.service.deletePoint('point-id'),
    ).resolves.toBeUndefined();
    await expect(fixture.service.deletePoint('missing-id')).rejects.toThrow(
      new NotFoundException('Point with ID missing-id not found'),
    );
    expect(fixture.pointRepository.delete).toHaveBeenNthCalledWith(
      1,
      'point-id',
    );
    expect(
      fixture.reunionsEventPublisher.publishChangeSafely,
    ).toHaveBeenCalledTimes(1);
    await fixture.moduleRef.close();
  });

  it('does not publish an update when all supplied fields are unchanged', async () => {
    const fixture = await makeFixture();
    const point = makePoint();
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);
    fixture.reunionRepository.findOne.mockResolvedValueOnce(point.reunion);
    fixture.pointRepository.save.mockResolvedValueOnce(point);

    await fixture.service.updatePoint('point-id', {
      titulo: point.titulo,
      content: point.content,
      done: point.done,
      reunionId: point.reunion.id,
    });

    expect(
      fixture.reunionsEventPublisher.publishChangeSafely,
    ).not.toHaveBeenCalled();
    await fixture.moduleRef.close();
  });
});
