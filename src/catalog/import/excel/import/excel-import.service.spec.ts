import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { Artist } from '../../../../artists/entities/artist.entity';
import { Country } from '../../../../countries/entities/country.entity';
import { Disc } from '../../../../discs/entities/disc.entity';
import { Genre } from '../../../../genres/entities/genre.entity';
import { ExcelWorkbookParser } from '../parser/excel-workbook.parser';
import { ExcelImportService } from './excel-import.service';

type SheetFixture = {
  name: string;
  rows: unknown[][];
  state?: 'visible' | 'hidden' | 'veryHidden';
};

async function createWorkbookBuffer(sheets: SheetFixture[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheetFixture of sheets) {
    const worksheet = workbook.addWorksheet(sheetFixture.name);
    if (sheetFixture.state) worksheet.state = sheetFixture.state;
    for (const values of sheetFixture.rows) worksheet.addRow(values);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('ExcelImportService', () => {
  let service: ExcelImportService;
  let genreRepo: {
    find: jest.Mock;
    save: jest.Mock;
  };
  let countryRepo: {
    find: jest.Mock;
    save: jest.Mock;
  };
  let discRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let artistRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const rock = { id: 'genre-rock', name: 'Rock' } as Genre;
  const pop = { id: 'genre-pop', name: 'Pop' } as Genre;
  const spain = { id: 'country-es', name: 'Spain' } as Country;
  const usa = { id: 'country-us', name: 'USA' } as Country;

  beforeEach(async () => {
    jest.restoreAllMocks();

    genreRepo = {
      find: jest.fn().mockResolvedValue([rock, pop]),
      save: jest.fn(),
    };
    countryRepo = {
      find: jest.fn().mockResolvedValue([spain, usa]),
      save: jest.fn(),
    };
    discRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((values: Partial<Disc>) => Object.assign(new Disc(), values)),
      save: jest.fn(async (disc: Disc) => ({ ...disc, id: 'disc-created' })),
      manager: { transaction: jest.fn() },
    };
    artistRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((values: Partial<Artist>) => Object.assign(new Artist(), values)),
      save: jest.fn(async (artist: Artist) => ({ ...artist, id: 'artist-created' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExcelImportService,
        ExcelWorkbookParser,
        { provide: getRepositoryToken(Genre), useValue: genreRepo },
        { provide: getRepositoryToken(Country), useValue: countryRepo },
        { provide: getRepositoryToken(Disc), useValue: discRepo },
        { provide: getRepositoryToken(Artist), useValue: artistRepo },
      ],
    }).compile();

    service = module.get<ExcelImportService>(ExcelImportService);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  });

  it('is defined with the four repository dependencies injected', () => {
    expect(service).toBeDefined();
    expect(genreRepo.find).toBeDefined();
    expect(countryRepo.find).toBeDefined();
    expect(discRepo.findOne).toBeDefined();
    expect(artistRepo.findOne).toBeDefined();
  });

  describe('importDiscs', () => {
    it('reads a valid workbook by positional columns and does not validate header names', async () => {
      const existingArtist = { id: 'artist-existing', name: 'Artist' } as Artist;
      artistRepo.findOne.mockResolvedValue(existingArtist);
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Any header names',
        rows: [
          ['not', 'validated', 'as', 'headers', 'here', 'either', 'way'],
          ['02/01/2020', ' Artist ', ' Album ', 'rOcK', 'sPaIn', 'si', 'No'],
        ],
      }]));

      expect(result).toEqual({ created: 1, errors: [] });
      expect(genreRepo.find).toHaveBeenCalledWith();
      expect(countryRepo.find).toHaveBeenCalledWith();
      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { name: 'Artist', countryId: 'country-es' },
      });
      expect(discRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Album',
        releaseDate: new Date(Date.UTC(2020, 0, 2)),
        debut: true,
        ep: false,
        artist: existingArtist,
        genre: rock,
      }));
      expect(discRepo.create.mock.calls[0][0]).not.toHaveProperty('country');
      expect(countryRepo.save).not.toHaveBeenCalled();
      expect(genreRepo.save).not.toHaveBeenCalled();
    });

    it('imports rows from each visible sheet and does not send hidden sheet rows to the catalogue', async () => {
      const result = await service.importDiscs(await createWorkbookBuffer([
        {
          name: 'Visible one',
          rows: [
            ['header', 'header', 'header', 'header', 'header', 'header', 'header'],
            ['01.01.2021', 'First Artist', 'First Disc', '', '', '', ''],
          ],
        },
        {
          name: 'Hidden',
          state: 'hidden',
          rows: [['header'], ['01.01.2021', 'Hidden Artist', 'Hidden Disc']],
        },
        {
          name: 'Very hidden',
          state: 'veryHidden',
          rows: [['header'], ['01.01.2021', 'Hidden Artist 2', 'Hidden Disc 2']],
        },
        {
          name: 'Visible two',
          rows: [['different header'], ['02.01.2021', 'Second Artist', 'Second Disc']],
        },
      ]));

      expect(result).toEqual({ created: 2, errors: [] });
      expect(artistRepo.findOne).toHaveBeenCalledTimes(2);
      expect(artistRepo.findOne).toHaveBeenNthCalledWith(1, {
        where: { name: 'First Artist' },
      });
      expect(artistRepo.findOne).toHaveBeenNthCalledWith(2, {
        where: { name: 'Second Artist' },
      });
      expect(discRepo.create).toHaveBeenCalledTimes(2);
      expect(discRepo.save).toHaveBeenCalledTimes(2);
    });

    it('imports an unparseable date as null without adding a row error', async () => {
      artistRepo.findOne.mockResolvedValue({ id: 'artist-existing', name: 'Artist' });
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [['header'], ['not a date', 'Artist', 'Album']],
      }]));

      expect(result).toEqual({ created: 1, errors: [] });
      expect(discRepo.create).toHaveBeenCalledWith(expect.objectContaining({ releaseDate: null }));
    });

    it('silently skips rows without Artist and Disc while still reporting a missing required field', async () => {
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [
          ['header'],
          ['01.01.2020', '', ''],
          ['', '', 'Disc without artist'],
        ],
      }]));

      expect(result).toEqual({
        created: 0,
        errors: [{
          row: 3,
          disc: 'Disc without artist',
          artist: '',
          error: '[Hoja: Discos] El campo "Artista" es obligatorio',
        }],
      });
      expect(artistRepo.findOne).not.toHaveBeenCalled();
    });

    it('finds an existing Artist using the exact trimmed name and optional Country ID', async () => {
      const existingArtist = { id: 'artist-existing', name: 'Artist' } as Artist;
      artistRepo.findOne.mockResolvedValue(existingArtist);
      await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [['header'], ['', ' Artist ', 'Album', '', 'SPAIN']],
      }]));

      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { name: 'Artist', countryId: 'country-es' },
      });
      expect(artistRepo.create).not.toHaveBeenCalled();
      expect(artistRepo.save).not.toHaveBeenCalled();
    });

    it('creates a new Artist with the Excel lowercase-only nameNormalized and Country ID', async () => {
      await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [['header'], ['', 'Árbol  Del Mar', 'Album', '', 'Spain']],
      }]));

      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { name: 'Árbol  Del Mar', countryId: 'country-es' },
      });
      expect(artistRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Árbol  Del Mar',
        nameNormalized: 'árbol  del mar',
        countryId: 'country-es',
      }));
      expect(artistRepo.create.mock.calls[0][0]).not.toHaveProperty('country');
      expect(artistRepo.save).toHaveBeenCalledTimes(1);
    });

    it('looks up and creates an Artist without a Country when column 5 is empty', async () => {
      await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [['header'], ['', 'Artist', 'Album']],
      }]));

      expect(artistRepo.findOne).toHaveBeenCalledWith({ where: { name: 'Artist' } });
      expect(artistRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Artist',
        nameNormalized: 'artist',
      }));
      expect(artistRepo.create.mock.calls[0][0]).not.toHaveProperty('countryId');
    });

    it('allows absent Country and Genre without creating either catalogue record', async () => {
      artistRepo.findOne.mockResolvedValue({ id: 'artist-existing', name: 'Artist' });
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [['header'], ['', 'Artist', 'Album', '', '']],
      }]));

      expect(result).toEqual({ created: 1, errors: [] });
      expect(artistRepo.findOne).toHaveBeenCalledWith({ where: { name: 'Artist' } });
      expect(discRepo.create).toHaveBeenCalledWith(expect.not.objectContaining({ genre: expect.anything() }));
      expect(countryRepo.save).not.toHaveBeenCalled();
      expect(genreRepo.save).not.toHaveBeenCalled();
    });

    it('reports unknown Genre and Country by row and continues to a later valid row', async () => {
      artistRepo.findOne.mockResolvedValue({ id: 'artist-existing', name: 'Artist' });
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [
          ['header'],
          ['', 'Artist', 'Bad genre', 'Unknown genre'],
          ['', 'Artist', 'Bad country', '', 'Unknown country'],
          ['', 'Artist', 'Good album'],
        ],
      }]));

      expect(result).toEqual({
        created: 1,
        errors: [
          { row: 2, disc: 'Bad genre', artist: 'Artist', error: '[Hoja: Discos] Género "Unknown genre" no encontrado en la base de datos' },
          { row: 3, disc: 'Bad country', artist: 'Artist', error: '[Hoja: Discos] País "Unknown country" no encontrado en la base de datos' },
        ],
      });
      expect(artistRepo.findOne).toHaveBeenCalledTimes(1);
      expect(countryRepo.save).not.toHaveBeenCalled();
      expect(genreRepo.save).not.toHaveBeenCalled();
    });

    it('adds a new Disc with current explicit values and entity defaults, Genre, and flags', async () => {
      const existingArtist = { id: 'artist-existing', name: 'Artist' } as Artist;
      artistRepo.findOne.mockResolvedValue(existingArtist);
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [['header'], ['03.06.2023', 'Artist', 'Album', 'Rock', '', 'si', 'si']],
      }]));

      expect(result).toEqual({ created: 1, errors: [] });
      expect(discRepo.create).toHaveBeenCalledWith({
        name: 'Album',
        releaseDate: new Date(Date.UTC(2023, 5, 3)),
        debut: true,
        ep: true,
        artist: existingArtist,
        genre: rock,
      });
      const createdDisc = discRepo.create.mock.results[0].value as Disc;
      expect(createdDisc.verified).toBe(false);
      expect(createdDisc.featured).toBe(false);
      expect(createdDisc.description).toBeUndefined();
      expect(createdDisc.image).toBeUndefined();
      expect(createdDisc.link).toBeUndefined();
      expect(discRepo.save).toHaveBeenCalledWith(createdDisc);
    });

    it('reports missing Artist and Disc fields with row details and continues', async () => {
      artistRepo.findOne.mockResolvedValue({ id: 'artist-existing', name: 'Artist' });
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Required fields', rows: [
          ['header'],
          ['', '', 'Disc without artist'],
          ['', 'Artist without disc', ''],
          ['', 'Artist', 'Valid disc'],
        ],
      }]));

      expect(result).toEqual({
        created: 1,
        errors: [
          { row: 2, disc: 'Disc without artist', artist: '', error: '[Hoja: Required fields] El campo "Artista" es obligatorio' },
          { row: 3, disc: '', artist: 'Artist without disc', error: '[Hoja: Required fields] El campo "Disco" es obligatorio' },
        ],
      });
      expect(discRepo.save).toHaveBeenCalledTimes(1);
    });

    it('reports exact duplicate errors, includes releaseDate in the lookup when parsed, and does not update existing Discs', async () => {
      const existingArtist = { id: 'artist-existing', name: 'Artist' } as Artist;
      const existingDisc = { id: 'disc-existing', name: 'Album' } as Disc;
      artistRepo.findOne.mockResolvedValue(existingArtist);
      discRepo.findOne.mockResolvedValue(existingDisc);
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [
          ['header'],
          ['04.05.2024', 'Artist', 'Album'],
          ['', 'Artist', 'Album'],
        ],
      }]));

      expect(discRepo.findOne).toHaveBeenNthCalledWith(1, {
        where: { name: 'Album', artist: { id: 'artist-existing' }, releaseDate: new Date(Date.UTC(2024, 4, 4)) },
      });
      expect(discRepo.findOne).toHaveBeenNthCalledWith(2, {
        where: { name: 'Album', artist: { id: 'artist-existing' } },
      });
      expect(result).toEqual({
        created: 0,
        errors: [
          { row: 2, disc: 'Album', artist: 'Artist', error: '[Hoja: Discos] El disco ya existe en la base de datos' },
          { row: 3, disc: 'Album', artist: 'Artist', error: '[Hoja: Discos] El disco ya existe en la base de datos' },
        ],
      });
      expect(discRepo.create).not.toHaveBeenCalled();
      expect(discRepo.save).not.toHaveBeenCalled();
      expect(artistRepo.save).not.toHaveBeenCalled();
    });

    it('catches a persistence error for one row, keeps earlier writes, and continues later rows', async () => {
      const existingArtist = { id: 'artist-existing', name: 'Artist' } as Artist;
      const persistedDiscNames: string[] = [];
      artistRepo.findOne.mockResolvedValue(existingArtist);
      discRepo.save
        .mockImplementationOnce(async (disc: Disc) => {
          persistedDiscNames.push(disc.name);
          return { ...disc, id: 'disc-first' };
        })
        .mockRejectedValueOnce(new Error('database write failed'))
        .mockImplementationOnce(async (disc: Disc) => {
          persistedDiscNames.push(disc.name);
          return { ...disc, id: 'disc-last' };
        });
      const result = await service.importDiscs(await createWorkbookBuffer([{
        name: 'Discos', rows: [
          ['header'],
          ['', 'Artist', 'Saved first'],
          ['', 'Artist', 'Fails'],
          ['', 'Artist', 'Saved last'],
        ],
      }]));

      expect(result).toEqual({
        created: 2,
        errors: [{
          row: 3,
          disc: 'Fails',
          artist: 'Artist',
          error: '[Hoja: Discos] database write failed',
        }],
      });
      expect(discRepo.save).toHaveBeenCalledTimes(3);
      expect(discRepo.save.mock.calls.map(([disc]) => disc.name)).toEqual(['Saved first', 'Fails', 'Saved last']);
      expect(persistedDiscNames).toEqual(['Saved first', 'Saved last']);
      expect(discRepo.manager.transaction).not.toHaveBeenCalled();
    });
  });
});
