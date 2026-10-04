import { NotFoundException } from '@nestjs/common';
import { ILike, Repository } from 'typeorm';
import { Artist } from '../../../artists/entities/artist.entity';
import { Country } from '../../../countries/entities/country.entity';
import { Disc } from '../../../discs/entities/disc.entity';
import { Genre } from '../../../genres/entities/genre.entity';
import { CatalogImportService } from './catalog-import.service';
import { ManualImportLogger } from '../logging/manual-import-logger';

describe('CatalogImportService characterization', () => {
  let service: CatalogImportService;
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
  let manualImportLogger: { log: jest.Mock };
  let writeLog: jest.Mock;

  beforeEach(() => {
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

    service = new CatalogImportService(
      artistRepository as unknown as Repository<Artist>,
      discRepository as unknown as Repository<Disc>,
      countryRepository as unknown as Repository<Country>,
      genreRepository as unknown as Repository<Genre>,
      manualImportLogger as unknown as ManualImportLogger,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('processes a valid entry and saves a new disc with its current defaults', async () => {
    const report = await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: 'Arbol - Album', ep: true, debut: true }],
    });

    expect(countryRepository.findOne).toHaveBeenCalledWith({ where: { name: 'Sin pais' } });
    expect(artistRepository.findOne).toHaveBeenCalledWith({ where: { name: ILike('Arbol') } });
    expect(artistRepository.create).toHaveBeenCalledWith({
      name: 'Arbol',
      nameNormalized: 'arbol',
      description: '',
      image: '',
      country: undefined,
    });
    expect(artistRepository.save).toHaveBeenCalledTimes(1);
    expect(discRepository.findOne).toHaveBeenCalledWith({
      where: { name: ILike('Album'), artist: { id: 'artist-1' } },
    });
    expect(discRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Album',
      description: '',
      image: '',
      verified: false,
      link: '',
      artist: expect.objectContaining({ id: 'artist-1' }),
      ep: true,
      debut: true,
      releaseDate: new Date(2026, 9, 4),
    }));
    expect(discRepository.save).toHaveBeenCalledTimes(1);
    expect(report.savedDiscs).toEqual([{
      discId: 'disc-1',
      artistId: 'artist-1',
      message: `Artist "Arbol" => Disc "Album" => Date: ${new Date(2026, 9, 4)}`,
    }]);
    expect(report.existingDiscs).toEqual([]);
    expect(writeLog).toHaveBeenCalledWith(expect.stringContaining('Processing manual data for date: October 4, 2026'));
    expect(writeLog).toHaveBeenCalledWith(expect.stringContaining('Processed: Artist "Arbol" => Disc "Album"'));
  });

  it('reuses the default country when creating an artist and resolves explicit genre and country IDs', async () => {
    const defaultCountry = { id: 'default-country', name: 'Sin pais' } as Country;
    const selectedCountry = { id: 'country-1', name: 'Country' } as Country;
    const genre = { id: 'genre-1', name: 'Genre' } as Genre;
    countryRepository.findOne
      .mockResolvedValueOnce(defaultCountry)
      .mockResolvedValueOnce(selectedCountry);
    genreRepository.findOne.mockResolvedValue(genre);

    await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: 'Árbol  del  Mar - Álbum', genreId: 'genre-1', countryId: 'country-1' }],
    });

    expect(countryRepository.findOne).toHaveBeenNthCalledWith(2, { where: { id: 'country-1' } });
    expect(genreRepository.findOne).toHaveBeenCalledWith({ where: { id: 'genre-1' } });
    expect(artistRepository.create).toHaveBeenCalledWith({
      name: 'Árbol  del  Mar',
      nameNormalized: 'arbol del mar',
      description: '',
      image: '',
      country: selectedCountry,
    });
    expect(discRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Álbum',
      genre,
      ep: false,
      debut: false,
    }));
  });

  it('assigns the Sin pais fallback to a new artist when no countryId is provided', async () => {
    const defaultCountry = { id: 'default-country', name: 'Sin pais' } as Country;
    countryRepository.findOne.mockResolvedValue(defaultCountry);

    await service.processManualData({
      date: 'October 4, 2026',
      albums: [{ line: 'Artist - Album' }],
    });

    expect(artistRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Artist',
      country: defaultCountry,
    }));
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
    expect(report).toEqual({
      savedDiscs: [],
      existingDiscs: [{
        discId: 'disc-existing',
        artistId: 'artist-existing',
        message: 'Artist "Artist" => Disc "Album"',
      }],
    });
    expect(writeLog).toHaveBeenCalledWith(expect.stringContaining('Already exists: Artist "Artist" => Disc "Album"'));
  });

  it('processes valid entries sequentially and retains bulk order in the report', async () => {
    const report = await service.processManualData({
      date: 'October 4, 2026',
      albums: [
        { line: 'First – Album' },
        { line: 'Second - Album' },
      ],
    });

    expect(artistRepository.findOne).toHaveBeenNthCalledWith(1, { where: { name: ILike('First') } });
    expect(artistRepository.findOne).toHaveBeenNthCalledWith(2, { where: { name: ILike('Second') } });
    expect(report.savedDiscs.map(({ message }) => message)).toEqual([
      `Artist "First" => Disc "Album" => Date: ${new Date(2026, 9, 4)}`,
      `Artist "Second" => Disc "Album" => Date: ${new Date(2026, 9, 4)}`,
    ]);
  });

  it('logs omitted lines in input order and continues to the next entry', async () => {
    await service.processManualData({
      date: 'October 4, 2026',
      albums: [
        { line: 'Artist - Re-Release album' },
        { line: 'Malformed line' },
        { line: 'Next Artist - Album' },
      ],
    });

    expect(writeLog.mock.calls).toEqual([
      ['Processing manual data for date: October 4, 2026'],
      ['Skipping album (Re-Release): Artist - Re-Release album'],
      ['Unexpected format: Malformed line'],
      [`Processed: Artist "Next Artist" => Disc "Album" => Date: ${new Date(2026, 9, 4)}`],
    ]);
  });

  it('shares logging across concurrent imports and orders entries by their actual write calls', async () => {
    let releaseFirstCountry: (country: Country | null) => void;
    let releaseSecondCountry: (country: Country | null) => void;
    const firstCountry = new Promise<Country | null>((resolve) => { releaseFirstCountry = resolve; });
    const secondCountry = new Promise<Country | null>((resolve) => { releaseSecondCountry = resolve; });
    countryRepository.findOne.mockReturnValueOnce(firstCountry).mockReturnValueOnce(secondCountry);

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

  it('logs and rejects an invalid date before reading or writing catalog data', async () => {
    await expect(service.processManualData({ date: 'Not a date', albums: [] })).rejects.toThrow('Invalid date: Not a date');

    expect(countryRepository.findOne).not.toHaveBeenCalled();
    expect(artistRepository.findOne).not.toHaveBeenCalled();
    expect(discRepository.save).not.toHaveBeenCalled();
    expect(writeLog).toHaveBeenCalledWith(expect.stringContaining('Invalid date provided: Not a date'));
  });

  it.each([
    ['genre', 'genre-404', genreRepository, { line: 'Artist - Album', genreId: 'genre-404' }, 'Genre genre-404 not found'],
    ['country', 'country-404', countryRepository, { line: 'Artist - Album', countryId: 'country-404' }, 'Country country-404 not found'],
  ])('rejects a missing %s and logs its lookup failure', async (_kind, id, repository, album, message) => {
    await expect(service.processManualData({ date: 'October 4, 2026', albums: [album] }))
      .rejects.toBeInstanceOf(NotFoundException);

    expect(writeLog).toHaveBeenCalledWith(expect.stringContaining(`${message.split(' ')[0]} ${id} not found for album: Artist - Album`));
    expect(artistRepository.findOne).not.toHaveBeenCalled();
  });

  it('keeps earlier album writes when a later album fails and writes both success and error logs', async () => {
    await expect(service.processManualData({
      date: 'October 4, 2026',
      albums: [
        { line: 'First - Album' },
        { line: 'Second - Album', genreId: 'missing-genre' },
      ],
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(artistRepository.save).toHaveBeenCalledTimes(1);
    expect(discRepository.save).toHaveBeenCalledTimes(1);
    expect(discRepository.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Album' }));
    expect(writeLog.mock.calls).toEqual([
      ['Processing manual data for date: October 4, 2026'],
      [`Processed: Artist "First" => Disc "Album" => Date: ${new Date(2026, 9, 4)}`],
      ['Genre missing-genre not found for album: Second - Album'],
    ]);
  });
});
