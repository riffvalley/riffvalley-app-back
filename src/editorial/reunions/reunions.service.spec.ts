import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DeleteResult,
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
} from 'typeorm';
import { Content } from 'src/editorial/contents/entities/content.entity';
import { ContentsService } from 'src/editorial/contents/contents.service';
import { Reunion } from './entities/reunion.entity';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';
import { Point } from './points/entities/point.entity';
import { ReunionService } from './reunions.service';

type ReunionRepositoryMock = {
  create: jest.Mock<Reunion, [DeepPartial<Reunion>]>;
  save: jest.Mock<Promise<Reunion>, [Reunion]>;
  find: jest.Mock<Promise<Reunion[]>, [FindManyOptions<Reunion>?]>;
  findOne: jest.Mock<Promise<Reunion | null>, [FindOneOptions<Reunion>]>;
  delete: jest.Mock<Promise<DeleteResult>, [string]>;
};

type ContentRepositoryMock = {
  findOne: jest.Mock<
    Promise<Pick<Content, 'id' | 'reunionId'> | null>,
    [FindOneOptions<Content>]
  >;
};

type ContentsServiceMock = Pick<ContentsService, 'remove'> & {
  remove: jest.Mock<Promise<void>, [string]>;
};

const makeReunion = (overrides: Partial<Reunion> = {}): Reunion => ({
  id: 'reunion-id',
  titulo: 'Weekly reunion',
  fecha: new Date('2026-10-21T18:00:00.000Z'),
  points: [],
  createdAt: new Date('2026-10-20T00:00:00.000Z'),
  updatedAt: new Date('2026-10-20T00:00:00.000Z'),
  ...overrides,
});

const makePoint = (reunion: Reunion): Point => ({
  id: 'point-id',
  titulo: 'Agenda item',
  content: '',
  reunion,
  createdAt: new Date('2026-10-20T00:00:00.000Z'),
  done: false,
});

describe('ReunionService', () => {
  const makeFixture = async () => {
    const reunionRepository: ReunionRepositoryMock = {
      create: jest.fn<Reunion, [DeepPartial<Reunion>]>(),
      save: jest.fn<Promise<Reunion>, [Reunion]>(),
      find: jest.fn<Promise<Reunion[]>, [FindManyOptions<Reunion>?]>(),
      findOne: jest.fn<Promise<Reunion | null>, [FindOneOptions<Reunion>]>(),
      delete: jest.fn<Promise<DeleteResult>, [string]>(),
    };
    const contentRepository: ContentRepositoryMock = {
      findOne: jest.fn<
        Promise<Pick<Content, 'id' | 'reunionId'> | null>,
        [FindOneOptions<Content>]
      >(),
    };
    const contentsService: ContentsServiceMock = {
      remove: jest.fn<Promise<void>, [string]>(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReunionService,
        {
          provide: getRepositoryToken(Reunion),
          useValue: reunionRepository,
        },
        {
          provide: getRepositoryToken(Content),
          useValue: contentRepository,
        },
        { provide: ContentsService, useValue: contentsService },
      ],
    }).compile();

    return {
      service: moduleRef.get(ReunionService),
      reunionRepository,
      contentRepository,
      contentsService,
      moduleRef,
    };
  };

  it('creates and saves the supplied Reunion fields', async () => {
    const fixture = await makeFixture();
    const dto: CreateReunionDto = {
      titulo: 'Weekly reunion',
      fecha: new Date('2026-10-21T18:00:00.000Z'),
      description: 'Editorial agenda',
    };
    const saved = makeReunion(dto);
    fixture.reunionRepository.create.mockReturnValueOnce(saved);
    fixture.reunionRepository.save.mockResolvedValueOnce(saved);

    await expect(fixture.service.createReunion(dto)).resolves.toBe(saved);
    expect(fixture.reunionRepository.create).toHaveBeenCalledWith(dto);
    expect(fixture.reunionRepository.save).toHaveBeenCalledWith(saved);
    await fixture.moduleRef.close();
  });

  it('lists reunions with Points ordered by descending date', async () => {
    const fixture = await makeFixture();
    const reunion = makeReunion();
    reunion.points = [makePoint(reunion)];
    const reunions = [reunion];
    fixture.reunionRepository.find.mockResolvedValueOnce(reunions);

    await expect(fixture.service.findAll()).resolves.toBe(reunions);
    expect(fixture.reunionRepository.find).toHaveBeenCalledWith({
      relations: ['points'],
      order: { fecha: 'DESC' },
    });
    await fixture.moduleRef.close();
  });

  it('loads Points for a single Reunion and returns 404 when missing', async () => {
    const fixture = await makeFixture();
    const reunion = makeReunion();
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
    await fixture.moduleRef.close();
  });

  it('updates the loaded Reunion fields and returns the saved entity', async () => {
    const fixture = await makeFixture();
    const reunion = makeReunion({ titulo: 'Old title' });
    const saved = makeReunion({ titulo: 'New title' });
    const update: UpdateReunionDto = { titulo: 'New title' };
    jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(reunion);
    fixture.reunionRepository.save.mockResolvedValueOnce(saved);

    await expect(
      fixture.service.updateReunion('reunion-id', update),
    ).resolves.toBe(saved);
    expect(reunion.titulo).toBe('New title');
    expect(fixture.reunionRepository.save).toHaveBeenCalledWith(reunion);
    await fixture.moduleRef.close();
  });

  it('delegates linked Content deletion to ContentsService', async () => {
    const fixture = await makeFixture();
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
    await fixture.moduleRef.close();
  });

  it('deletes an unlinked Reunion and returns 404 when none was deleted', async () => {
    const fixture = await makeFixture();
    fixture.contentRepository.findOne.mockResolvedValue(null);
    fixture.reunionRepository.delete
      .mockResolvedValueOnce({ affected: 1, raw: [] })
      .mockResolvedValueOnce({ affected: 0, raw: [] });

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
    await fixture.moduleRef.close();
  });
});
