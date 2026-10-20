import { NotFoundException } from '@nestjs/common';
import { Point } from './entities/point.entity';
import { CreatePointDto } from './dto/create-points.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { PointService } from './points.service';

describe('PointService', () => {
  const makeFixture = () => {
    const pointRepository = {
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => value),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    const reunionRepository = { findOne: jest.fn() };
    const service = new PointService(
      pointRepository as any,
      reunionRepository as any,
    );

    return { service, pointRepository, reunionRepository };
  };

  it('validates Reunion and saves a Point associated with it', async () => {
    const fixture = makeFixture();
    const reunion = { id: 'reunion-id' };
    const dto: CreatePointDto = {
      titulo: 'Assign weekly radar',
      reunionId: reunion.id,
      content: '',
      done: false,
    };
    fixture.reunionRepository.findOne.mockResolvedValueOnce(reunion);
    const saved = { id: 'point-id', titulo: dto.titulo, reunion };
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
  });

  it('returns 404 and does not save when the Reunion reference is missing', async () => {
    const fixture = makeFixture();
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
  });

  it('lists Points with Reunion and loads Reunion on findOne', async () => {
    const fixture = makeFixture();
    const points = [{ id: 'point-id', reunion: { id: 'reunion-id' } }];
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
  });

  it('returns 404 when findOne cannot locate a Point', async () => {
    const fixture = makeFixture();
    fixture.pointRepository.findOne.mockResolvedValueOnce(null);

    await expect(fixture.service.findOne('missing-id')).rejects.toThrow(
      new NotFoundException('Point with ID missing-id not found'),
    );
  });

  it('updates supplied fields and preserves the Reunion when reunionId is omitted', async () => {
    const fixture = makeFixture();
    const originalReunion = { id: 'original-reunion-id' };
    const point = {
      id: 'point-id',
      titulo: 'Old title',
      reunion: originalReunion,
    } as Point;
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);

    await expect(
      fixture.service.updatePoint('point-id', {
        titulo: 'New title',
      } as UpdatePointDto),
    ).resolves.toBe(point);

    expect(point.titulo).toBe('New title');
    expect(point.reunion).toBe(originalReunion);
    expect(fixture.pointRepository.save).toHaveBeenCalledWith(point);
    expect(fixture.reunionRepository.findOne).not.toHaveBeenCalled();
  });

  it('reassigns a Point to an existing Reunion', async () => {
    const fixture = makeFixture();
    const originalReunion = { id: 'original-reunion-id' };
    const destination = { id: 'destination-reunion-id' };
    const point = {
      id: 'point-id',
      titulo: 'Task',
      reunion: originalReunion,
    } as Point;
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);
    fixture.reunionRepository.findOne.mockResolvedValueOnce(destination);
    fixture.pointRepository.save.mockResolvedValueOnce({
      ...point,
      reunion: destination,
    });

    const result = await fixture.service.updatePoint('point-id', {
      reunionId: destination.id,
    } as UpdatePointDto);

    expect(fixture.reunionRepository.findOne).toHaveBeenCalledWith({
      where: { id: destination.id },
    });
    expect(fixture.pointRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ reunion: destination }),
    );
    expect(result.reunion).toBe(destination);
    expect(result).not.toHaveProperty('reunionId');
  });

  it('returns 404 and does not save when the destination Reunion is missing', async () => {
    const fixture = makeFixture();
    const point = {
      id: 'point-id',
      reunion: { id: 'original-reunion-id' },
    } as Point;
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);
    fixture.reunionRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      fixture.service.updatePoint('point-id', {
        reunionId: 'missing-reunion-id',
      } as UpdatePointDto),
    ).rejects.toThrow(
      new NotFoundException('Reunion with ID missing-reunion-id not found'),
    );
    expect(point.reunion).toEqual({ id: 'original-reunion-id' });
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
  });

  it('rejects null reunionId instead of querying with an empty reference', async () => {
    const fixture = makeFixture();
    const point = { id: 'point-id', reunion: { id: 'reunion-id' } } as Point;
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(point);

    await expect(
      fixture.service.updatePoint('point-id', { reunionId: null } as any),
    ).rejects.toThrow('reunionId must be a UUID v4');
    expect(fixture.reunionRepository.findOne).not.toHaveBeenCalled();
    expect(fixture.pointRepository.save).not.toHaveBeenCalled();
  });

  it('deletes a Point and returns 404 when no row was affected', async () => {
    const fixture = makeFixture();
    fixture.pointRepository.delete
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

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
  });
});
