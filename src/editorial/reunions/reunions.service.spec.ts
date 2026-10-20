import { NotFoundException } from '@nestjs/common';
import { Reunion } from './entities/reunion.entity';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { ReunionService } from './reunions.service';

describe('ReunionService', () => {
  const makeFixture = () => {
    const reunionRepository = {
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => value),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    const contentRepository = { findOne: jest.fn() };
    const contentsService = { remove: jest.fn() };
    const service = new ReunionService(
      reunionRepository as any,
      contentRepository as any,
      contentsService as any,
    );

    return { service, reunionRepository, contentRepository, contentsService };
  };

  it('creates and saves the supplied Reunion fields', async () => {
    const fixture = makeFixture();
    const dto: CreateReunionDto = {
      titulo: 'Weekly reunion',
      fecha: new Date('2026-10-21T18:00:00.000Z'),
      description: 'Editorial agenda',
    };
    const saved = { id: 'reunion-id', ...dto };
    fixture.reunionRepository.save.mockResolvedValueOnce(saved);

    await expect(fixture.service.createReunion(dto)).resolves.toBe(saved);
    expect(fixture.reunionRepository.create).toHaveBeenCalledWith(dto);
    expect(fixture.reunionRepository.save).toHaveBeenCalledWith(dto);
  });

  it('lists reunions with Points ordered by descending date', async () => {
    const fixture = makeFixture();
    const reunions = [{ id: 'reunion-id', points: [{ id: 'point-id' }] }];
    fixture.reunionRepository.find.mockResolvedValueOnce(reunions);

    await expect(fixture.service.findAll()).resolves.toBe(reunions);
    expect(fixture.reunionRepository.find).toHaveBeenCalledWith({
      relations: ['points'],
      order: { fecha: 'DESC' },
    });
  });

  it('loads Points for a single Reunion and returns 404 when missing', async () => {
    const fixture = makeFixture();
    const reunion = { id: 'reunion-id', points: [{ id: 'point-id' }] };
    fixture.reunionRepository.findOne
      .mockResolvedValueOnce(reunion)
      .mockResolvedValueOnce(null);

    await expect(fixture.service.findOne('reunion-id')).resolves.toBe(reunion);
    expect(fixture.reunionRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { id: 'reunion-id' },
      relations: ['points'],
    });
    await expect(fixture.service.findOne('missing-id')).rejects.toThrow(
      new NotFoundException('Reunion with ID missing-id not found'),
    );
  });

  it('updates the loaded Reunion fields and returns the saved entity', async () => {
    const fixture = makeFixture();
    const reunion = { id: 'reunion-id', titulo: 'Old title' } as Reunion;
    const saved = { ...reunion, titulo: 'New title' };
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(reunion);
    fixture.reunionRepository.save.mockResolvedValueOnce(saved);

    await expect(
      fixture.service.updateReunion('reunion-id', {
        titulo: 'New title',
      }),
    ).resolves.toBe(saved);
    expect(reunion.titulo).toBe('New title');
    expect(fixture.reunionRepository.save).toHaveBeenCalledWith(reunion);
  });

  it('delegates linked Content deletion to ContentsService', async () => {
    const fixture = makeFixture();
    fixture.contentRepository.findOne.mockResolvedValueOnce({
      id: 'content-id',
      reunionId: 'reunion-id',
    });

    await expect(
      fixture.service.deleteReunion('reunion-id'),
    ).resolves.toBeUndefined();
    expect(fixture.contentRepository.findOne).toHaveBeenCalledWith({
      where: { reunionId: 'reunion-id' },
    });
    expect(fixture.contentsService.remove).toHaveBeenCalledWith('content-id');
    expect(fixture.reunionRepository.delete).not.toHaveBeenCalled();
  });

  it('deletes an unlinked Reunion and returns 404 when none was deleted', async () => {
    const fixture = makeFixture();
    fixture.contentRepository.findOne.mockResolvedValue(null);
    fixture.reunionRepository.delete
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    await expect(
      fixture.service.deleteReunion('reunion-id'),
    ).resolves.toBeUndefined();
    expect(fixture.reunionRepository.delete).toHaveBeenNthCalledWith(
      1,
      'reunion-id',
    );
    await expect(fixture.service.deleteReunion('missing-id')).rejects.toThrow(
      new NotFoundException('Reunion with ID missing-id not found'),
    );
  });
});
