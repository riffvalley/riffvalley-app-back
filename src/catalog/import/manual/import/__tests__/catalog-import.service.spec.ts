import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ILike, QueryFailedError } from 'typeorm';
import { AlbumItemDto } from '../../dto/process-manual-data.dto';
import { Artist } from '../../../../artists/entities/artist.entity';
import { Country } from '../../../../countries/entities/country.entity';
import { Disc } from '../../../../discs/entities/disc.entity';
import { Genre } from '../../../../genres/entities/genre.entity';
import { CatalogImportService } from '../catalog-import.service';
import { ManualImportLogger } from '../../logging/manual-import-logger';

const SAFE_GLOBAL_ERROR =
  'No se pudo completar la importación. Los discos confirmados antes del fallo se conservan.';

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the operation to fail');
}

describe('CatalogImportService characterization', () => {
  let service: CatalogImportService;
  let moduleRef: TestingModule;
  let artistRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let discRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let countryRepository: { findOne: jest.Mock };
  let genreRepository: { findOne: jest.Mock };
  let dataSource: { createQueryRunner: jest.Mock };
  let queryRunners: Array<{
    manager: { getRepository: jest.Mock };
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  }>;
  let failNextRollback: boolean;
  let manualImportLogger: { log: jest.Mock };
  let writeLog: jest.Mock;

  beforeEach(async () => {
    jest.restoreAllMocks();
    writeLog = jest.fn();
    manualImportLogger = { log: writeLog };

    artistRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((artist) => artist),
      save: jest.fn(async (artist) => ({ ...artist, id: 'artist-1' })),
    };
    discRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((disc) => disc),
      save: jest.fn(async (disc) => ({ ...disc, id: 'disc-1' })),
    };
    countryRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    genreRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    queryRunners = [];
    failNextRollback = false;
    const createQueryRunner = () => {
      const runner = {
        manager: {
          getRepository: jest.fn((entity) => {
            if (entity === Artist) return artistRepository;
            if (entity === Disc) return discRepository;
            throw new Error(`Unexpected transactional entity: ${entity.name}`);
          }),
        },
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
      };
      if (failNextRollback) {
        runner.rollbackTransaction.mockRejectedValueOnce(
          new Error('rollback failed'),
        );
        failNextRollback = false;
      }
      queryRunners.push(runner);
      return runner;
    };
    dataSource = { createQueryRunner: jest.fn(createQueryRunner) };

    moduleRef = await Test.createTestingModule({
      providers: [
        CatalogImportService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(Country), useValue: countryRepository },
        { provide: getRepositoryToken(Genre), useValue: genreRepository },
        { provide: ManualImportLogger, useValue: manualImportLogger },
      ],
    }).compile();
    service = moduleRef.get(CatalogImportService);
  });

  afterEach(async () => {
    await moduleRef.close();
    jest.restoreAllMocks();
  });

  it('processes a valid entry and saves a new disc with its current defaults', async () => {
    const report = await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: 'Arbol - Album', ep: true, debut: true }],
    });

    expect(countryRepository.findOne).toHaveBeenCalledWith({
      where: { name: 'Sin pais' },
    });
    expect(artistRepository.findOne).toHaveBeenCalledWith({
      where: { nameNormalized: 'arbol' },
    });
    expect(artistRepository.create).toHaveBeenCalledWith({
      name: 'Arbol',
      nameNormalized: 'arbol',
      searchNameNormalized: 'arbol',
      description: '',
      image: '',
      country: undefined,
    });
    expect(artistRepository.save).toHaveBeenCalledTimes(1);
    expect(discRepository.findOne).toHaveBeenCalledWith({
      where: { name: ILike('Album'), artist: { id: 'artist-1' } },
    });
    expect(discRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Album',
        searchNameNormalized: 'album',
        description: '',
        image: '',
        verified: false,
        link: '',
        artist: expect.objectContaining({ id: 'artist-1' }),
        ep: true,
        debut: true,
        releaseDate: new Date(2026, 9, 4),
      }),
    );
    expect(discRepository.save).toHaveBeenCalledTimes(1);
    const queryRunner = queryRunners[0];
    expect(queryRunner.manager.getRepository).toHaveBeenNthCalledWith(
      1,
      Artist,
    );
    expect(queryRunner.manager.getRepository).toHaveBeenNthCalledWith(2, Disc);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(report.results).toEqual([
      {
        inputIndex: 0,
        source: { kind: 'manual', inputLine: 'Arbol - Album' },
        status: 'imported',
        artistName: 'Arbol',
        discName: 'Album',
        artistId: 'artist-1',
        discId: 'disc-1',
        message: 'Disco importado correctamente.',
      },
    ]);
    expect(writeLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'Processing manual data for date: October 4, 2026',
      ),
    );
    expect(writeLog).toHaveBeenCalledWith(
      expect.stringContaining('Processed: Artist "Arbol" => Disc "Album"'),
    );
  });

  it('reuses the default country when creating an artist and resolves explicit genre and country IDs', async () => {
    const defaultCountry = {
      id: 'default-country',
      name: 'Sin pais',
    } as Country;
    const selectedCountry = { id: 'country-1', name: 'Country' } as Country;
    const genre = { id: 'genre-1', name: 'Genre' } as Genre;
    countryRepository.findOne
      .mockResolvedValueOnce(defaultCountry)
      .mockResolvedValueOnce(selectedCountry);
    genreRepository.findOne.mockResolvedValue(genre);

    await service.processManualData({
      date: 'October 4, 2026',
      albums: [
        {
          line: 'Árbol  del  Mar - Álbum',
          genreId: '11111111-1111-4111-8111-111111111111',
          countryId: '22222222-2222-4222-8222-222222222222',
        },
      ],
    });

    expect(countryRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: '22222222-2222-4222-8222-222222222222' },
    });
    expect(genreRepository.findOne).toHaveBeenCalledWith({
      where: { id: '11111111-1111-4111-8111-111111111111' },
    });
    expect(artistRepository.create).toHaveBeenCalledWith({
      name: 'Árbol  del  Mar',
      nameNormalized: 'arbol del mar',
      searchNameNormalized: 'arbol del mar',
      description: '',
      image: '',
      country: selectedCountry,
    });
    expect(discRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Álbum',
        genre,
        ep: false,
        debut: false,
      }),
    );
  });

  it('assigns the Sin pais fallback to a new artist when no countryId is provided', async () => {
    const defaultCountry = {
      id: 'default-country',
      name: 'Sin pais',
    } as Country;
    countryRepository.findOne.mockResolvedValue(defaultCountry);

    await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: 'Artist - Album' }],
    });

    expect(artistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Artist',
        country: defaultCountry,
      }),
    );
  });

  it('uses an existing artist and reports an existing disc without updating either record', async () => {
    const artist = { id: 'artist-existing', name: 'Artist' } as Artist;
    const disc = { id: 'disc-existing', name: 'Album' } as Disc;
    artistRepository.findOne.mockResolvedValue(artist);
    discRepository.findOne.mockResolvedValue(disc);

    const report = await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: 'Artist – Album (Remastered)', ep: true }],
    });

    expect(artistRepository.create).not.toHaveBeenCalled();
    expect(artistRepository.save).not.toHaveBeenCalled();
    expect(discRepository.create).not.toHaveBeenCalled();
    expect(discRepository.save).not.toHaveBeenCalled();
    expect(report.results).toEqual([
      {
        inputIndex: 0,
        source: { kind: 'manual', inputLine: 'Artist – Album (Remastered)' },
        status: 'duplicate',
        artistName: 'Artist',
        discName: 'Album',
        artistId: 'artist-existing',
        discId: 'disc-existing',
        message: 'El disco ya existe y se ha omitido.',
      },
    ]);
    expect(artistRepository.findOne).toHaveBeenCalledWith({
      where: { nameNormalized: 'artist' },
    });
    expect(writeLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'Already exists: Artist "Artist" => Disc "Album"',
      ),
    );
  });

  it('keeps imported and duplicate results interleaved in original order, including repeated titles', async () => {
    artistRepository.findOne
      .mockResolvedValueOnce({ id: 'artist-a', name: 'Artist A' })
      .mockResolvedValueOnce({ id: 'artist-b', name: 'Artist B' })
      .mockResolvedValueOnce({ id: 'artist-c', name: 'Artist C' });
    discRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'disc-existing', name: 'Same Title' })
      .mockResolvedValueOnce(null);

    const { results } = await service.processManualData({
      date: 'October 4, 2026',
      albums: [
        { line: 'Artist A - Same Title' },
        { line: 'Artist B - Same Title' },
        { line: 'Artist C - Same Title' },
      ],
    });

    expect(
      results.map(({ inputIndex, source, status }) => ({
        inputIndex,
        inputLine: source.kind === 'manual' ? source.inputLine : undefined,
        status,
      })),
    ).toEqual([
      { inputIndex: 0, inputLine: 'Artist A - Same Title', status: 'imported' },
      {
        inputIndex: 1,
        inputLine: 'Artist B - Same Title',
        status: 'duplicate',
      },
      { inputIndex: 2, inputLine: 'Artist C - Same Title', status: 'imported' },
    ]);
  });

  it.each([
    ['Björk', 'bjork'],
    ['Björk + Co', 'bjork co'],
    ['Two   Spaces', 'two spaces'],
    ['Árbol  +  Ñandú', 'arbol nandu'],
  ])(
    'normalizes %j for lookup and creation while preserving its visible name and Disc relation',
    async (artistName, normalizedArtistName) => {
      const visibleArtist = artistName as string;
      const normalizedKey = normalizedArtistName as string;

      await service.processManualData({
        date: 'October 4, 2026',
        albums: [{ line: `${visibleArtist} - Album` }],
      });

      expect(artistRepository.findOne).toHaveBeenCalledWith({
        where: { nameNormalized: normalizedKey },
      });
      expect(artistRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: visibleArtist,
          nameNormalized: normalizedKey,
        }),
      );
      const savedArtist = await artistRepository.save.mock.results[0].value;
      expect(discRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: savedArtist,
        }),
      );
    },
  );

  it('reuses an existing Artist when its normalized key matches and links the new Disc to it', async () => {
    const existingArtist = {
      id: 'artist-normalized',
      name: 'Björk + Co',
      nameNormalized: 'bjork co',
    } as Artist;
    artistRepository.findOne.mockResolvedValue(existingArtist);

    await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: 'Bjork  +  Co - Album' }],
    });

    expect(artistRepository.findOne).toHaveBeenCalledWith({
      where: { nameNormalized: 'bjork co' },
    });
    expect(artistRepository.create).not.toHaveBeenCalled();
    expect(artistRepository.save).not.toHaveBeenCalled();
    expect(discRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        artist: existingArtist,
      }),
    );
  });

  it('processes valid entries sequentially and retains bulk order in the report', async () => {
    const report = await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: 'First – Album' }, { line: 'Second - Album' }],
    });

    expect(artistRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { nameNormalized: 'first' },
    });
    expect(artistRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { nameNormalized: 'second' },
    });
    expect(
      report.results.map(({ inputIndex, status }) => ({ inputIndex, status })),
    ).toEqual([
      { inputIndex: 0, status: 'imported' },
      { inputIndex: 1, status: 'imported' },
    ]);
  });

  it('logs omitted lines in input order and continues to the next entry', async () => {
    const { results } = await service.processManualData({
      date: 'October 4, 2026',
      albums: [
        { line: 'Artist - Re-Release album' },
        { line: 'Malformed line' },
        { line: 'Next Artist - Album' },
      ],
    });

    expect(
      results.map((result) => ({
        inputIndex: result.inputIndex,
        status: result.status,
        reasonCode: result.status === 'failed' ? result.reasonCode : undefined,
      })),
    ).toEqual([
      { inputIndex: 0, status: 'failed', reasonCode: 'RE_RELEASE' },
      { inputIndex: 1, status: 'failed', reasonCode: 'INVALID_INPUT' },
      { inputIndex: 2, status: 'imported', reasonCode: undefined },
    ]);
    expect(writeLog.mock.calls).toEqual([
      ['Processing manual data for date: October 4, 2026'],
      ['Skipping album (Re-Release): Artist - Re-Release album'],
      ['Unexpected format: Malformed line'],
      [
        `Processed: Artist "Next Artist" => Disc "Album" => Date: ${new Date(2026, 9, 4)}`,
      ],
    ]);
  });

  it('reports an empty line as an identifiable invalid result and then continues', async () => {
    const { results } = await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: '' }, { line: 'Artist - Album' }],
    });

    expect(
      results.map((result) => ({
        inputIndex: result.inputIndex,
        status: result.status,
        reasonCode: result.status === 'failed' ? result.reasonCode : undefined,
      })),
    ).toEqual([
      { inputIndex: 0, status: 'failed', reasonCode: 'INVALID_INPUT' },
      { inputIndex: 1, status: 'imported', reasonCode: undefined },
    ]);
    expect(results[0].source).toEqual({ kind: 'manual', inputLine: '' });
  });

  it('classifies invalid per-entry field types and UUIDs without rejecting the whole batch', async () => {
    const malformedAlbum = new AlbumItemDto();
    Object.defineProperty(malformedAlbum, 'line', { value: 42 });

    const { results } = await service.processManualData({
      date: 'October 4, 2026',
      albums: [
        malformedAlbum,
        { line: 'Artist - Album', genreId: 'not-a-uuid' },
        { line: 'Next Artist - Album' },
      ],
    });

    expect(
      results.map((result) => ({
        inputIndex: result.inputIndex,
        status: result.status,
        reasonCode: result.status === 'failed' ? result.reasonCode : undefined,
      })),
    ).toEqual([
      { inputIndex: 0, status: 'failed', reasonCode: 'INVALID_INPUT' },
      { inputIndex: 1, status: 'failed', reasonCode: 'INVALID_INPUT' },
      { inputIndex: 2, status: 'imported', reasonCode: undefined },
    ]);
    expect(artistRepository.findOne).toHaveBeenCalledTimes(1);
  });

  it('shares logging across concurrent imports and orders entries by their actual write calls', async () => {
    let releaseFirstCountry: (country: Country | null) => void;
    let releaseSecondCountry: (country: Country | null) => void;
    const firstCountry = new Promise<Country | null>((resolve) => {
      releaseFirstCountry = resolve;
    });
    const secondCountry = new Promise<Country | null>((resolve) => {
      releaseSecondCountry = resolve;
    });
    countryRepository.findOne
      .mockReturnValueOnce(firstCountry)
      .mockReturnValueOnce(secondCountry);

    const firstImport = service.processManualData({
      date: 'October 1, 2026',
      albums: [{ line: 'First - Re-Release' }],
    });
    const secondImport = service.processManualData({
      date: 'October 2, 2026',
      albums: [{ line: 'Second - Re-Release' }],
    });

    releaseSecondCountry(null);
    await secondImport;
    releaseFirstCountry(null);
    await firstImport;

    expect(writeLog.mock.calls).toEqual([
      ['Processing manual data for date: October 1, 2026'],
      ['Processing manual data for date: October 2, 2026'],
      ['Skipping album (Re-Release): Second - Re-Release'],
      ['Skipping album (Re-Release): First - Re-Release'],
    ]);
  });

  it.each([
    'Not a date',
    'February 31, 2026',
    'Undecember 4, 2026',
    'February 29, 2025',
    'February NaN, 2026',
  ])(
    'rejects invalid shared date %j as a safe client error before catalog access',
    async (date) => {
      const error = await captureError(
        service.processManualData({ date, albums: [] }),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        message:
          'La fecha debe ser válida y usar el formato "October 4, 2026".',
        error: 'Bad Request',
      });
      expect(countryRepository.findOne).not.toHaveBeenCalled();
      expect(artistRepository.findOne).not.toHaveBeenCalled();
      expect(discRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'genre',
      {
        line: 'Artist - Album',
        genreId: '33333333-3333-4333-8333-333333333333',
      },
      1,
    ],
    [
      'country',
      {
        line: 'Artist - Album',
        countryId: '44444444-4444-4444-8444-444444444444',
      },
      2,
    ],
  ])(
    'reports a missing %s as a row failure and continues',
    async (kind, missingAlbum, expectedCallCount) => {
      const repository = kind === 'genre' ? genreRepository : countryRepository;
      const results = await service.processManualData({
        date: 'October 4, 2026',
        albums: [missingAlbum, { line: 'Next Artist - Album' }],
      });

      expect(
        results.results.map((result) => ({
          status: result.status,
          reasonCode:
            result.status === 'failed' ? result.reasonCode : undefined,
        })),
      ).toEqual([
        { status: 'failed', reasonCode: 'REFERENCE_NOT_FOUND' },
        { status: 'imported', reasonCode: undefined },
      ]);
      expect(repository.findOne).toHaveBeenCalledTimes(expectedCallCount);
      expect(artistRepository.findOne).toHaveBeenCalledTimes(1);
    },
  );

  it('retains earlier commits and reports a missing reference without stopping later entries', async () => {
    const report = await service.processManualData({
      date: 'October 4, 2026',
      albums: [
        { line: 'First - Album' },
        {
          line: 'Second - Album',
          genreId: '55555555-5555-4555-8555-555555555555',
        },
        { line: 'Third - Album' },
      ],
    });

    expect(artistRepository.save).toHaveBeenCalledTimes(2);
    expect(discRepository.save).toHaveBeenCalledTimes(2);
    expect(discRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Album' }),
    );
    expect(
      report.results.map((result) => ({
        status: result.status,
        reasonCode: result.status === 'failed' ? result.reasonCode : undefined,
      })),
    ).toEqual([
      { status: 'imported', reasonCode: undefined },
      { status: 'failed', reasonCode: 'REFERENCE_NOT_FOUND' },
      { status: 'imported', reasonCode: undefined },
    ]);
    expect(writeLog.mock.calls).toEqual([
      ['Processing manual data for date: October 4, 2026'],
      [
        `Processed: Artist "First" => Disc "Album" => Date: ${new Date(2026, 9, 4)}`,
      ],
      ['Reference not found for album: Second - Album'],
      [
        `Processed: Artist "Third" => Disc "Album" => Date: ${new Date(2026, 9, 4)}`,
      ],
    ]);
  });

  it('continues after an allowlisted row persistence error only when rollback succeeds', async () => {
    discRepository.save
      .mockResolvedValueOnce({ id: 'disc-first' })
      .mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('private SQL detail'), {
            code: '23503',
            detail: 'private SQL detail',
          }),
        ),
      )
      .mockResolvedValueOnce({ id: 'disc-third' });

    const report = await service.processManualData({
      date: 'October 4, 2026',
      albums: [
        { line: 'First Artist - First Album' },
        { line: 'Second Artist - Second Album' },
        { line: 'Third Artist - Third Album' },
      ],
    });

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(3);
    expect(
      queryRunners.map((runner) => runner.startTransaction.mock.calls.length),
    ).toEqual([1, 1, 1]);
    expect(
      queryRunners.map((runner) => runner.commitTransaction.mock.calls.length),
    ).toEqual([1, 0, 1]);
    expect(
      queryRunners.map(
        (runner) => runner.rollbackTransaction.mock.calls.length,
      ),
    ).toEqual([0, 1, 0]);
    expect(
      report.results.map((result) => ({
        status: result.status,
        reasonCode: result.status === 'failed' ? result.reasonCode : undefined,
      })),
    ).toEqual([
      { status: 'imported', reasonCode: undefined },
      { status: 'failed', reasonCode: 'PERSISTENCE_FAILED' },
      { status: 'imported', reasonCode: undefined },
    ]);
    expect(JSON.stringify(report)).not.toContain('private SQL detail');
  });

  it('stops on an unknown persistence error after a confirmed rollback', async () => {
    discRepository.save.mockRejectedValueOnce(new Error('disc save failed'));

    const error = await captureError(
      service.processManualData({
        date: 'October 4, 2026',
        albums: [{ line: 'Artist - Album' }, { line: 'Must Not Run - Album' }],
      }),
    );
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as InternalServerErrorException).getResponse()).toMatchObject(
      {
        message: SAFE_GLOBAL_ERROR,
      },
    );
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify((error as InternalServerErrorException).getResponse()),
    ).not.toContain('disc save failed');
  });

  it('treats a PostgreSQL connection loss as systemic after rollback', async () => {
    discRepository.save.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('connection lost'), { code: '08006' }),
      ),
    );

    const error = await captureError(
      service.processManualData({
        date: 'October 4, 2026',
        albums: [{ line: 'Artist - Album' }, { line: 'Must Not Run - Album' }],
      }),
    );

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(artistRepository.findOne).toHaveBeenCalledTimes(1);
    expect(queryRunners[0].rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('stops and returns a safe global error when rollback is uncertain', async () => {
    discRepository.save.mockRejectedValueOnce(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('foreign key error'), { code: '23503' }),
      ),
    );
    failNextRollback = true;

    await expect(
      service.processManualData({
        date: 'October 4, 2026',
        albums: [{ line: 'Artist - Album' }, { line: 'Must Not Run - Album' }],
      }),
    ).rejects.toThrow(SAFE_GLOBAL_ERROR);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(queryRunners[0].rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunners[0].commitTransaction).not.toHaveBeenCalled();
  });

  it('stops when commit fails even if a later row is valid', async () => {
    queryRunners = [];
    dataSource.createQueryRunner.mockImplementationOnce(() => {
      const runner = {
        manager: {
          getRepository: jest.fn((entity) =>
            entity === Artist ? artistRepository : discRepository,
          ),
        },
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest
          .fn()
          .mockRejectedValue(new Error('commit detail')),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
      };
      queryRunners.push(runner);
      return runner;
    });

    const error = await captureError(
      service.processManualData({
        date: 'October 4, 2026',
        albums: [{ line: 'Artist - Album' }, { line: 'Must Not Run - Album' }],
      }),
    );
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify((error as InternalServerErrorException).getResponse()),
    ).not.toContain('commit detail');
  });

  it('stops when QueryRunner release fails after a disc was committed', async () => {
    const runner = {
      manager: {
        getRepository: jest.fn((entity) =>
          entity === Artist ? artistRepository : discRepository,
        ),
      },
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockRejectedValue(new Error('release detail')),
    };
    dataSource.createQueryRunner.mockReturnValueOnce(runner);

    const error = await captureError(
      service.processManualData({
        date: 'October 4, 2026',
        albums: [{ line: 'Artist - Album' }, { line: 'Must Not Run - Album' }],
      }),
    );

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as InternalServerErrorException).getResponse()).toMatchObject(
      {
        message: SAFE_GLOBAL_ERROR,
      },
    );
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify((error as InternalServerErrorException).getResponse()),
    ).not.toContain('release detail');
  });

  it('does not write to or remove a preexisting Artist when its Disc save fails', async () => {
    artistRepository.findOne.mockResolvedValue({
      id: 'artist-existing',
      name: 'Artist',
    });
    discRepository.save.mockRejectedValueOnce(new Error('disc save failed'));

    await expect(
      service.processManualData({
        date: 'October 4, 2026',
        albums: [{ line: 'Artist - Album' }, { line: 'Must Not Run - Album' }],
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(artistRepository.save).not.toHaveBeenCalled();
    expect(queryRunners[0].rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
  });
});
