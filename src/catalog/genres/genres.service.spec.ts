import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Genre } from './entities/genre.entity';
import { GenresService } from './genres.service';
import { CreateGenreDto } from './dto/create-genre.dto';
import { UpdateGenreDto } from './dto/update-genre.dto';
import { PaginationDto } from '../../common/dtos/pagination.dto';

describe('GenresService current behavior', () => {
  let service: GenresService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    findOneByOrFail: jest.Mock;
    preload: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findAndCount: jest.fn(),
      findOneByOrFail: jest.fn(),
      preload: jest.fn(),
      delete: jest.fn(),
    };
    service = new GenresService(repository as unknown as Repository<Genre>);
  });

  describe('create', () => {
    it('creates and saves the DTO payload, returning the created entity', async () => {
      const dto = { name: 'Rock', color: '#123456' } as CreateGenreDto;
      const entity = { id: 'genre-id', ...dto } as Genre;
      repository.create.mockReturnValue(entity);

      await expect(service.create(dto)).resolves.toBe(entity);
      expect(repository.create).toHaveBeenCalledWith(dto);
      expect(repository.save).toHaveBeenCalledWith(entity);
      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('maps a unique constraint error to BadRequestException with the database detail', async () => {
      const detail = 'Key (name)=(Rock) already exists.';
      repository.create.mockReturnValue({ name: 'Rock', color: '#123456' });
      repository.save.mockRejectedValue({ code: '23505', detail });

      await expect(service.create({ name: 'Rock', color: '#123456' } as CreateGenreDto))
        .rejects.toMatchObject({ status: 400, message: detail });
    });

    it('maps other persistence errors to the current internal server error', async () => {
      repository.create.mockReturnValue({ name: 'Rock', color: '#123456' });
      repository.save.mockRejectedValue(new Error('database offline'));

      await expect(service.create({ name: 'Rock', color: '#123456' } as CreateGenreDto))
        .rejects.toMatchObject({
          status: 500,
          message: 'An unexpected error occurred',
        });
    });
  });

  describe('bulkCreate', () => {
    it('rejects a non-array genres value with the current 400 status and message', async () => {
      await expect(service.bulkCreate({ genres: 'Rock' } as any)).rejects.toMatchObject({
        status: 400,
        message: 'The genres property must be an array of objects with name and color properties',
      });
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('creates and saves all genres as a batch, preserving input order in { message, data }', async () => {
      const payload = {
        genres: [
          { name: 'Rock', color: '#111111' },
          { name: 'Jazz', color: '#222222' },
          { name: 'Pop', color: '#333333' },
        ],
      };
      const entities = payload.genres.map((genre, index) => ({ id: `genre-${index}`, ...genre }));
      repository.create.mockImplementation((genre) => entities.find((entity) => entity.name === genre.name));

      await expect(service.bulkCreate(payload)).resolves.toEqual({
        message: '3 genres have been successfully created.',
        data: entities,
      });
      expect(repository.create.mock.calls).toEqual(payload.genres.map((genre) => [genre]));
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith(entities);
    });

    it('saves an empty batch and returns the current zero-count envelope', async () => {
      const response = await service.bulkCreate({ genres: [] });
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith([]);
      expect(response).toEqual({ message: '0 genres have been successfully created.', data: [] });
    });

    it('does not validate fields inside the genres array before create/save', async () => {
      const genreWithoutColor = { name: 'No color' };
      await service.bulkCreate({ genres: [genreWithoutColor] } as any);
      expect(repository.create).toHaveBeenCalledWith({ name: 'No color', color: undefined });
      expect(repository.save).toHaveBeenCalledWith([{ name: 'No color', color: undefined }]);
    });

    it('maps a batch persistence unique constraint error to BadRequestException', async () => {
      repository.save.mockRejectedValue({ code: '23505', detail: 'duplicate genre' });
      await expect(service.bulkCreate({ genres: [{ name: 'Rock', color: '#123456' }] }))
        .rejects.toMatchObject({ status: 400, message: 'duplicate genre' });
    });

    it('maps another batch persistence error to the current internal server error', async () => {
      repository.save.mockRejectedValue(new Error('database offline'));
      await expect(service.bulkCreate({ genres: [] })).rejects.toMatchObject({
        status: 500,
        message: 'An unexpected error occurred',
      });
    });
  });

  describe('findAll', () => {
    it('uses defaults 10 and 0 and returns the complete current response shape', async () => {
      const genres = [{ id: 'genre-1', name: 'Jazz' }, { id: 'genre-2', name: 'Rock' }] as Genre[];
      repository.findAndCount.mockResolvedValue([genres, 12]);

      await expect(service.findAll({} as PaginationDto)).resolves.toEqual({
        totalItems: 12,
        totalPages: 2,
        currentPage: 1,
        limit: 10,
        data: genres,
      });
      expect(repository.findAndCount).toHaveBeenCalledWith({
        take: 10,
        skip: 0,
        order: { name: 'ASC' },
      });
    });

    it('uses supplied limit and offset and calculates pages from offset / limit', async () => {
      const genres = [{ id: 'genre-id', name: 'Rock' }] as Genre[];
      repository.findAndCount.mockResolvedValue([genres, 11]);
      await expect(service.findAll({ limit: 5, offset: 10 } as PaginationDto)).resolves.toEqual({
        totalItems: 11,
        totalPages: 3,
        currentPage: 3,
        limit: 5,
        data: genres,
      });
      expect(repository.findAndCount).toHaveBeenCalledWith({
        take: 5,
        skip: 10,
        order: { name: 'ASC' },
      });
    });

    it('preserves zero limit behavior at the service boundary', async () => {
      repository.findAndCount.mockResolvedValue([[], 4]);
      const response = await service.findAll({ limit: 0, offset: 0 } as PaginationDto);
      expect(repository.findAndCount).toHaveBeenCalledWith({
        take: 0,
        skip: 0,
        order: { name: 'ASC' },
      });
      expect(response).toEqual({
        totalItems: 4,
        totalPages: Infinity,
        currentPage: NaN,
        limit: 0,
        data: [],
      });
    });

    it('preserves supplied negative values at the service boundary', async () => {
      repository.findAndCount.mockResolvedValue([[], 4]);
      const response = await service.findAll({ limit: -2, offset: -5 } as PaginationDto);
      expect(repository.findAndCount).toHaveBeenCalledWith({
        take: -2,
        skip: -5,
        order: { name: 'ASC' },
      });
      expect(response).toEqual({
        totalItems: 4,
        totalPages: -2,
        currentPage: 3,
        limit: -2,
        data: [],
      });
    });
  });

  describe('findOne', () => {
    it('returns the found Genre entity', async () => {
      const genre = { id: 'genre-id', name: 'Rock', color: '#123456' } as Genre;
      repository.findOneByOrFail.mockResolvedValue(genre);
      await expect(service.findOne(genre.id)).resolves.toBe(genre);
      expect(repository.findOneByOrFail).toHaveBeenCalledWith({ id: genre.id });
    });

    it('maps an absent ID to the current NotFoundException and message', async () => {
      repository.findOneByOrFail.mockRejectedValue(new Error('Entity not found'));
      await expect(service.findOne('missing-id')).rejects.toEqual(
        new NotFoundException('Genre with id missing-id not found'),
      );
    });

    it('also maps unrelated repository failures to the same 404', async () => {
      repository.findOneByOrFail.mockRejectedValue(new Error('database offline'));
      await expect(service.findOne('genre-id')).rejects.toEqual(
        new NotFoundException('Genre with id genre-id not found'),
      );
    });
  });

  describe('update', () => {
    it.each([
      ['name', { name: 'Alternative' }, { id: 'genre-id', name: 'Alternative', color: '#123456' }],
      ['color', { color: '#abcdef' }, { id: 'genre-id', name: 'Rock', color: '#abcdef' }],
    ])('preloads and saves a partial %s update', async (_field, dto, entity) => {
      repository.preload.mockResolvedValue(entity);
      await expect(service.update('genre-id', dto as UpdateGenreDto)).resolves.toBe(entity);
      expect(repository.preload).toHaveBeenCalledWith({ id: 'genre-id', ...dto });
      expect(repository.save).toHaveBeenCalledWith(entity);
    });

    it('throws the current 404 when preload returns no Genre', async () => {
      repository.preload.mockResolvedValue(undefined);
      await expect(service.update('missing-id', { name: 'Rock' } as UpdateGenreDto)).rejects.toEqual(
        new NotFoundException('Genre with id missing-id not found'),
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('maps save errors using the same current database error handling as create', async () => {
      repository.preload.mockResolvedValue({ id: 'genre-id', name: 'Rock' });
      repository.save.mockRejectedValue({ code: '23505', detail: 'duplicate genre' });
      await expect(service.update('genre-id', { name: 'Rock' } as UpdateGenreDto)).rejects.toEqual(
        new BadRequestException('duplicate genre'),
      );
    });
  });

  describe('remove', () => {
    it('returns the repository DeleteResult unchanged, including affected = 0', async () => {
      const deleteResult = { raw: [], affected: 0 };
      repository.delete.mockResolvedValue(deleteResult);
      await expect(service.remove('missing-id')).resolves.toBe(deleteResult);
      expect(repository.delete).toHaveBeenCalledWith({ id: 'missing-id' });
      expect(repository.delete).toHaveBeenCalledTimes(1);
    });
  });
});
