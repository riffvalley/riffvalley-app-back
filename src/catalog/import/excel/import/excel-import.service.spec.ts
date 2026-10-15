import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { InternalServerErrorException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Artist } from '../../../artists/entities/artist.entity';
import { Country } from '../../../countries/entities/country.entity';
import { Disc } from '../../../discs/entities/disc.entity';
import { Genre } from '../../../genres/entities/genre.entity';
import { ExcelWorkbookParser } from '../parser/excel-workbook.parser';
import { ExcelImportService } from './excel-import.service';

type SheetFixture = {
  name: string;
  rows: unknown[][];
  state?: 'visible' | 'hidden' | 'veryHidden';
  dateFormatRows?: number[];
};

async function createWorkbookBuffer(sheets: SheetFixture[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheetFixture of sheets) {
    const worksheet = workbook.addWorksheet(sheetFixture.name);
    if (sheetFixture.state) worksheet.state = sheetFixture.state;
    for (const [index, values] of sheetFixture.rows.entries()) {
      worksheet.addRow(values);
      if (sheetFixture.dateFormatRows?.includes(index + 1)) {
        worksheet.getCell(index + 1, 1).numFmt = 'dd/mm/yyyy';
      }
    }
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
  };
  let artistRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
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
  let failNextCommit: boolean;
  let failNextStart: boolean;
  let failNextRelease: boolean;

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
      create: jest.fn((values: Partial<Disc>) =>
        Object.assign(new Disc(), values),
      ),
      save: jest.fn(async (disc: Disc) => ({ ...disc, id: 'disc-created' })),
    };
    artistRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((values: Partial<Artist>) =>
        Object.assign(new Artist(), values),
      ),
      save: jest.fn(async (artist: Artist) => ({
        ...artist,
        id: 'artist-created',
      })),
    };
    queryRunners = [];
    failNextRollback = false;
    failNextCommit = false;
    failNextStart = false;
    failNextRelease = false;
    const createQueryRunner = () => {
      const runner = {
        manager: {
          getRepository: jest.fn((entity) => {
            if (entity === Artist) return artistRepo;
            if (entity === Disc) return discRepo;
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
      if (failNextStart) {
        runner.startTransaction.mockRejectedValueOnce(
          new Error('start failed'),
        );
        failNextStart = false;
      }
      if (failNextCommit) {
        runner.commitTransaction.mockRejectedValueOnce(
          new Error('commit failed'),
        );
        failNextCommit = false;
      }
      if (failNextRelease) {
        runner.release.mockRejectedValueOnce(new Error('release failed'));
        failNextRelease = false;
      }
      queryRunners.push(runner);
      return runner;
    };
    dataSource = { createQueryRunner: jest.fn(createQueryRunner) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExcelImportService,
        ExcelWorkbookParser,
        { provide: getRepositoryToken(Genre), useValue: genreRepo },
        { provide: getRepositoryToken(Country), useValue: countryRepo },
        { provide: getRepositoryToken(Disc), useValue: discRepo },
        { provide: getRepositoryToken(Artist), useValue: artistRepo },
        {
          provide: getDataSourceToken(),
          useValue: dataSource as unknown as DataSource,
        },
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
      const existingArtist = {
        id: 'artist-existing',
        name: 'Artist',
      } as Artist;
      artistRepo.findOne.mockResolvedValue(existingArtist);
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Any header names',
            rows: [
              ['not', 'validated', 'as', 'headers', 'here', 'either', 'way'],
              [
                '02/01/2020',
                ' Artist ',
                ' Album ',
                'rOcK',
                'sPaIn',
                'si',
                'No',
              ],
            ],
          },
        ]),
      );

      expect(result.results).toEqual([
        expect.objectContaining({
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Any header names', rowNumber: 2 },
          status: 'imported',
          artistName: 'Artist',
          discName: 'Album',
          artistId: 'artist-existing',
          discId: 'disc-created',
        }),
      ]);
      expect(genreRepo.find).toHaveBeenCalledWith();
      expect(countryRepo.find).toHaveBeenCalledWith();
      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { nameNormalized: 'artist', countryId: 'country-es' },
      });
      expect(discRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Album',
          releaseDate: new Date(Date.UTC(2020, 0, 2)),
          debut: true,
          ep: false,
          artist: existingArtist,
          genre: rock,
        }),
      );
      expect(discRepo.create.mock.calls[0][0]).not.toHaveProperty('country');
      expect(countryRepo.save).not.toHaveBeenCalled();
      expect(genreRepo.save).not.toHaveBeenCalled();
    });

    it('imports rows from each visible sheet and does not send hidden sheet rows to the catalogue', async () => {
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Visible one',
            rows: [
              [
                'header',
                'header',
                'header',
                'header',
                'header',
                'header',
                'header',
              ],
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
            rows: [
              ['header'],
              ['01.01.2021', 'Hidden Artist 2', 'Hidden Disc 2'],
            ],
          },
          {
            name: 'Visible two',
            rows: [
              ['different header'],
              ['02.01.2021', 'Second Artist', 'Second Disc'],
            ],
          },
        ]),
      );

      expect(
        result.results.map(({ inputIndex, source, status }) => ({
          inputIndex,
          source,
          status,
        })),
      ).toEqual([
        {
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Visible one', rowNumber: 2 },
          status: 'imported',
        },
        {
          inputIndex: 1,
          source: { kind: 'excel', sheet: 'Visible two', rowNumber: 2 },
          status: 'imported',
        },
      ]);
      expect(artistRepo.findOne).toHaveBeenCalledTimes(2);
      expect(artistRepo.findOne).toHaveBeenNthCalledWith(1, {
        where: { nameNormalized: 'first artist' },
      });
      expect(artistRepo.findOne).toHaveBeenNthCalledWith(2, {
        where: { nameNormalized: 'second artist' },
      });
      expect(discRepo.create).toHaveBeenCalledTimes(2);
      expect(discRepo.save).toHaveBeenCalledTimes(2);
    });

    it('processes 150 rows sequentially with one reference preload and one transaction per row', async () => {
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ...Array.from({ length: 150 }, (_, index) => [
                '',
                `Artist ${index}`,
                `Disc ${index}`,
              ]),
            ],
          },
        ]),
      );

      expect(result.results).toHaveLength(150);
      expect(result.results[0]).toMatchObject({
        inputIndex: 0,
        source: { kind: 'excel', sheet: 'Discos', rowNumber: 2 },
        status: 'imported',
      });
      expect(result.results[149]).toMatchObject({
        inputIndex: 149,
        source: { kind: 'excel', sheet: 'Discos', rowNumber: 151 },
        status: 'imported',
      });
      expect(genreRepo.find).toHaveBeenCalledTimes(1);
      expect(countryRepo.find).toHaveBeenCalledTimes(1);
      expect(artistRepo.findOne).toHaveBeenCalledTimes(150);
      expect(discRepo.findOne).toHaveBeenCalledTimes(150);
      expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(150);
    });

    it('reports an invalid date by source row and continues with a later valid row', async () => {
      artistRepo.findOne.mockResolvedValue({
        id: 'artist-existing',
        name: 'Artist',
      });
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ['31/02/2026', 'Artist', 'Invalid date'],
              ['05/04/2022', 'Artist', 'Valid date'],
            ],
          },
        ]),
      );

      expect(result.results).toEqual([
        {
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 2 },
          status: 'failed',
          reasonCode: 'INVALID_INPUT',
          artistName: 'Artist',
          discName: 'Invalid date',
          message: 'El campo "Fecha" no contiene una fecha válida.',
        },
        expect.objectContaining({
          inputIndex: 1,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 3 },
          status: 'imported',
          discName: 'Valid date',
        }),
      ]);
      expect(artistRepo.findOne).toHaveBeenCalledTimes(1);
      expect(discRepo.create).toHaveBeenCalledTimes(1);
      expect(discRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Valid date',
          releaseDate: new Date(Date.UTC(2022, 3, 5)),
        }),
      );
    });

    it('keeps an empty optional date as null without failing the row', async () => {
      await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [['header'], ['', 'Artist', 'Album']],
          },
        ]),
      );

      expect(discRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ releaseDate: null }),
      );
    });

    it('imports a numeric Excel date serial when ExcelJS identifies the cell as a date', async () => {
      await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [['header'], [45292, 'Artist', 'Album']],
            dateFormatRows: [2],
          },
        ]),
      );

      expect(discRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseDate: new Date(Date.UTC(2024, 0, 1)),
        }),
      );
    });

    it('reports every nonempty row with missing Artist or Disc fields', async () => {
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ['01.01.2020', '', ''],
              ['', '', 'Disc without artist'],
            ],
          },
        ]),
      );

      expect(result.results).toEqual([
        {
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 2 },
          status: 'failed',
          reasonCode: 'INVALID_INPUT',
          message: 'El campo "Artista" es obligatorio.',
        },
        {
          inputIndex: 1,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 3 },
          status: 'failed',
          reasonCode: 'INVALID_INPUT',
          discName: 'Disc without artist',
          message: 'El campo "Artista" es obligatorio.',
        },
      ]);
      expect(artistRepo.findOne).not.toHaveBeenCalled();
    });

    it('finds an existing Artist by normalized key and retains the optional Country ID constraint', async () => {
      const existingArtist = {
        id: 'artist-existing',
        name: 'Artist',
      } as Artist;
      artistRepo.findOne.mockResolvedValue(existingArtist);
      await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [['header'], ['', ' Artist ', 'Album', '', 'SPAIN']],
          },
        ]),
      );

      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { nameNormalized: 'artist', countryId: 'country-es' },
      });
      expect(artistRepo.create).not.toHaveBeenCalled();
      expect(artistRepo.save).not.toHaveBeenCalled();
    });

    it('creates a new Artist with the canonical normalized name and Country ID', async () => {
      await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [['header'], ['', 'Árbol  Del Mar', 'Album', '', 'Spain']],
          },
        ]),
      );

      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { nameNormalized: 'arbol del mar', countryId: 'country-es' },
      });
      expect(artistRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Árbol  Del Mar',
          nameNormalized: 'arbol del mar',
          countryId: 'country-es',
        }),
      );
      expect(artistRepo.create.mock.calls[0][0]).not.toHaveProperty('country');
      expect(artistRepo.save).toHaveBeenCalledTimes(1);
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

        await service.importDiscs(
          await createWorkbookBuffer([
            {
              name: 'Discos',
              rows: [['header'], ['', visibleArtist, 'Album']],
            },
          ]),
        );

        expect(artistRepo.findOne).toHaveBeenCalledWith({
          where: { nameNormalized: normalizedKey },
        });
        expect(artistRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: visibleArtist,
            nameNormalized: normalizedKey,
          }),
        );
        expect(discRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            artist: expect.objectContaining({
              name: visibleArtist,
              nameNormalized: normalizedKey,
              id: 'artist-created',
            }),
          }),
        );
      },
    );

    it('reuses an existing Artist when its normalized key matches and links the new Disc to it', async () => {
      const existingArtist = {
        id: 'artist-normalized',
        name: 'Björk + Co',
        nameNormalized: 'bjork co',
        countryId: 'country-es',
      } as Artist;
      artistRepo.findOne.mockResolvedValue(existingArtist);

      await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [['header'], ['', 'Bjork  +  Co', 'Album', '', 'Spain']],
          },
        ]),
      );

      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { nameNormalized: 'bjork co', countryId: 'country-es' },
      });
      expect(artistRepo.create).not.toHaveBeenCalled();
      expect(artistRepo.save).not.toHaveBeenCalled();
      expect(discRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: existingArtist,
        }),
      );
    });

    it('looks up and creates an Artist without a Country when column 5 is empty', async () => {
      await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [['header'], ['', 'Artist', 'Album']],
          },
        ]),
      );

      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { nameNormalized: 'artist' },
      });
      expect(artistRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Artist',
          nameNormalized: 'artist',
        }),
      );
      expect(artistRepo.create.mock.calls[0][0]).not.toHaveProperty(
        'countryId',
      );
    });

    it('allows absent Country and Genre without creating either catalogue record', async () => {
      artistRepo.findOne.mockResolvedValue({
        id: 'artist-existing',
        name: 'Artist',
      });
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [['header'], ['', 'Artist', 'Album', '', '']],
          },
        ]),
      );

      expect(result.results.map(({ status }) => status)).toEqual(['imported']);
      expect(artistRepo.findOne).toHaveBeenCalledWith({
        where: { nameNormalized: 'artist' },
      });
      expect(discRepo.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ genre: expect.anything() }),
      );
      expect(countryRepo.save).not.toHaveBeenCalled();
      expect(genreRepo.save).not.toHaveBeenCalled();
    });

    it('reports unknown Genre and Country by row and continues to a later valid row', async () => {
      artistRepo.findOne.mockResolvedValue({
        id: 'artist-existing',
        name: 'Artist',
      });
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ['', 'Artist', 'Bad genre', 'Unknown genre'],
              ['', 'Artist', 'Bad country', '', 'Unknown country'],
              ['', 'Artist', 'Good album'],
            ],
          },
        ]),
      );

      expect(result.results).toEqual([
        {
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 2 },
          status: 'failed',
          reasonCode: 'REFERENCE_NOT_FOUND',
          artistName: 'Artist',
          discName: 'Bad genre',
          message: 'No se encontró el género indicado en el catálogo.',
        },
        {
          inputIndex: 1,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 3 },
          status: 'failed',
          reasonCode: 'REFERENCE_NOT_FOUND',
          artistName: 'Artist',
          discName: 'Bad country',
          message: 'No se encontró el país indicado en el catálogo.',
        },
        expect.objectContaining({
          inputIndex: 2,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 4 },
          status: 'imported',
        }),
      ]);
      expect(artistRepo.findOne).toHaveBeenCalledTimes(1);
      expect(countryRepo.save).not.toHaveBeenCalled();
      expect(genreRepo.save).not.toHaveBeenCalled();
    });

    it('adds a new Disc with current explicit values and entity defaults, Genre, and flags', async () => {
      const existingArtist = {
        id: 'artist-existing',
        name: 'Artist',
      } as Artist;
      artistRepo.findOne.mockResolvedValue(existingArtist);
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ['03.06.2023', 'Artist', 'Album', 'Rock', '', 'si', 'si'],
            ],
          },
        ]),
      );

      expect(result.results[0]).toEqual(
        expect.objectContaining({
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 2 },
          status: 'imported',
          artistId: 'artist-existing',
          discId: 'disc-created',
        }),
      );
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
      artistRepo.findOne.mockResolvedValue({
        id: 'artist-existing',
        name: 'Artist',
      });
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Required fields',
            rows: [
              ['header'],
              ['', '', 'Disc without artist'],
              ['', 'Artist without disc', ''],
              ['', 'Artist', 'Valid disc'],
            ],
          },
        ]),
      );

      expect(result.results).toEqual([
        {
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Required fields', rowNumber: 2 },
          status: 'failed',
          reasonCode: 'INVALID_INPUT',
          discName: 'Disc without artist',
          message: 'El campo "Artista" es obligatorio.',
        },
        {
          inputIndex: 1,
          source: { kind: 'excel', sheet: 'Required fields', rowNumber: 3 },
          status: 'failed',
          reasonCode: 'INVALID_INPUT',
          artistName: 'Artist without disc',
          message: 'El campo "Disco" es obligatorio.',
        },
        expect.objectContaining({
          inputIndex: 2,
          source: { kind: 'excel', sheet: 'Required fields', rowNumber: 4 },
          status: 'imported',
        }),
      ]);
      expect(discRepo.save).toHaveBeenCalledTimes(1);
    });

    it('reports exact duplicate errors, includes releaseDate in the lookup when parsed, and does not update existing Discs', async () => {
      const existingArtist = {
        id: 'artist-existing',
        name: 'Artist',
      } as Artist;
      const existingDisc = { id: 'disc-existing', name: 'Album' } as Disc;
      artistRepo.findOne.mockResolvedValue(existingArtist);
      discRepo.findOne.mockResolvedValue(existingDisc);
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ['04.05.2024', 'Artist', 'Album'],
              ['', 'Artist', 'Album'],
            ],
          },
        ]),
      );

      expect(discRepo.findOne).toHaveBeenNthCalledWith(1, {
        where: {
          name: 'Album',
          artist: { id: 'artist-existing' },
          releaseDate: new Date(Date.UTC(2024, 4, 4)),
        },
      });
      expect(discRepo.findOne).toHaveBeenNthCalledWith(2, {
        where: { name: 'Album', artist: { id: 'artist-existing' } },
      });
      expect(result.results).toEqual([
        {
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 2 },
          status: 'duplicate',
          artistName: 'Artist',
          discName: 'Album',
          artistId: 'artist-existing',
          discId: 'disc-existing',
          message: 'El disco ya existe y se ha omitido.',
        },
        {
          inputIndex: 1,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 3 },
          status: 'duplicate',
          artistName: 'Artist',
          discName: 'Album',
          artistId: 'artist-existing',
          discId: 'disc-existing',
          message: 'El disco ya existe y se ha omitido.',
        },
      ]);
      expect(discRepo.create).not.toHaveBeenCalled();
      expect(discRepo.save).not.toHaveBeenCalled();
      expect(artistRepo.save).not.toHaveBeenCalled();
    });

    it('catches a persistence error for one row, keeps earlier writes, and continues later rows', async () => {
      const existingArtist = {
        id: 'artist-existing',
        name: 'Artist',
      } as Artist;
      const persistedDiscNames: string[] = [];
      artistRepo.findOne.mockResolvedValue(existingArtist);
      discRepo.save
        .mockImplementationOnce(async (disc: Disc) => {
          persistedDiscNames.push(disc.name);
          return { ...disc, id: 'disc-first' };
        })
        .mockRejectedValueOnce(
          new QueryFailedError(
            'INSERT',
            [],
            Object.assign(new Error('private SQL detail'), { code: '23503' }),
          ),
        )
        .mockImplementationOnce(async (disc: Disc) => {
          persistedDiscNames.push(disc.name);
          return { ...disc, id: 'disc-last' };
        });
      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ['', 'Artist', 'Saved first'],
              ['', 'Artist', 'Fails'],
              ['', 'Artist', 'Saved last'],
            ],
          },
        ]),
      );

      expect(
        result.results.map((item) => ({
          inputIndex: item.inputIndex,
          source: item.source,
          status: item.status,
          reasonCode: item.status === 'failed' ? item.reasonCode : undefined,
          artistId: item.status === 'failed' ? item.artistId : undefined,
        })),
      ).toEqual([
        {
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 2 },
          status: 'imported',
          reasonCode: undefined,
          artistId: undefined,
        },
        {
          inputIndex: 1,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 3 },
          status: 'failed',
          reasonCode: 'PERSISTENCE_FAILED',
          artistId: 'artist-existing',
        },
        {
          inputIndex: 2,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 4 },
          status: 'imported',
          reasonCode: undefined,
          artistId: undefined,
        },
      ]);
      expect(JSON.stringify(result)).not.toContain('private SQL detail');
      expect(discRepo.save).toHaveBeenCalledTimes(3);
      expect(discRepo.save.mock.calls.map(([disc]) => disc.name)).toEqual([
        'Saved first',
        'Fails',
        'Saved last',
      ]);
      expect(persistedDiscNames).toEqual(['Saved first', 'Saved last']);
      expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(3);
      expect(
        queryRunners.map(
          (runner) => runner.commitTransaction.mock.calls.length,
        ),
      ).toEqual([1, 0, 1]);
      expect(
        queryRunners.map(
          (runner) => runner.rollbackTransaction.mock.calls.length,
        ),
      ).toEqual([0, 1, 0]);
      for (const runner of queryRunners) {
        expect(runner.manager.getRepository.mock.calls).toEqual([
          [Artist],
          [Disc],
        ]);
      }
    });

    it('rolls back a newly created Artist when its Disc write fails and preserves prior commits', async () => {
      discRepo.save
        .mockResolvedValueOnce({ id: 'disc-first' })
        .mockRejectedValueOnce(
          new QueryFailedError(
            'INSERT',
            [],
            Object.assign(new Error('private SQL detail'), { code: '23503' }),
          ),
        );

      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ['', 'First Artist', 'First Disc'],
              ['', 'Second Artist', 'Second Disc'],
            ],
          },
        ]),
      );

      expect(result.results.map((item) => item.status)).toEqual([
        'imported',
        'failed',
      ]);
      expect(result.results[1]).toMatchObject({
        inputIndex: 1,
        source: { kind: 'excel', sheet: 'Discos', rowNumber: 3 },
        status: 'failed',
        reasonCode: 'PERSISTENCE_FAILED',
        artistName: 'Second Artist',
        discName: 'Second Disc',
        message: expect.not.stringContaining('private SQL detail'),
      });
      expect(result.results[1]).not.toHaveProperty('artistId');
      expect(JSON.stringify(result)).not.toContain('private SQL detail');
      expect(artistRepo.save).toHaveBeenCalledTimes(2);
      expect(discRepo.save).toHaveBeenCalledTimes(2);
      expect(
        queryRunners.map(
          (runner) => runner.commitTransaction.mock.calls.length,
        ),
      ).toEqual([1, 0]);
      expect(
        queryRunners.map(
          (runner) => runner.rollbackTransaction.mock.calls.length,
        ),
      ).toEqual([0, 1]);
    });

    it('does not continue after rollback itself fails', async () => {
      discRepo.save.mockRejectedValueOnce(new Error('disc save failed'));
      failNextRollback = true;

      await expect(
        service.importDiscs(
          await createWorkbookBuffer([
            {
              name: 'Discos',
              rows: [
                ['header'],
                ['', 'Artist', 'Fails'],
                ['', 'Artist', 'Must not continue'],
              ],
            },
          ]),
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(discRepo.save).toHaveBeenCalledTimes(1);
      expect(queryRunners[0].rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunners[0].release).toHaveBeenCalledTimes(1);
    });

    it('does not continue after a PostgreSQL connection failure', async () => {
      discRepo.save.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('connection lost'), { code: '08006' }),
        ),
      );

      const error = await service
        .importDiscs(
          await createWorkbookBuffer([
            {
              name: 'Discos',
              rows: [
                ['header'],
                ['', 'Artist', 'Fails'],
                ['', 'Artist', 'Must not continue'],
              ],
            },
          ]),
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(artistRepo.findOne).toHaveBeenCalledTimes(1);
      expect(discRepo.save).toHaveBeenCalledTimes(1);
      expect(
        JSON.stringify((error as InternalServerErrorException).getResponse()),
      ).not.toContain('connection lost');
    });

    it('does not process rows after transaction start fails', async () => {
      failNextStart = true;

      await expect(
        service.importDiscs(
          await createWorkbookBuffer([
            {
              name: 'Discos',
              rows: [
                ['header'],
                ['', 'Artist', 'Start fails'],
                ['', 'Artist', 'Must not continue'],
              ],
            },
          ]),
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(artistRepo.findOne).not.toHaveBeenCalled();
      expect(discRepo.save).not.toHaveBeenCalled();
    });

    it('does not turn QueryRunner creation failures into recoverable row errors', async () => {
      dataSource.createQueryRunner.mockImplementationOnce(() => {
        throw new Error('connection unavailable');
      });

      await expect(
        service.importDiscs(
          await createWorkbookBuffer([
            {
              name: 'Discos',
              rows: [
                ['header'],
                ['', 'Artist', 'Fails'],
                ['', 'Artist', 'Must not continue'],
              ],
            },
          ]),
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(artistRepo.findOne).not.toHaveBeenCalled();
      expect(discRepo.save).not.toHaveBeenCalled();
    });

    it('does not continue after transaction commit fails', async () => {
      failNextCommit = true;

      await expect(
        service.importDiscs(
          await createWorkbookBuffer([
            {
              name: 'Discos',
              rows: [
                ['header'],
                ['', 'Artist', 'Commit fails'],
                ['', 'Artist', 'Must not continue'],
              ],
            },
          ]),
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(discRepo.save).toHaveBeenCalledTimes(1);
      expect(queryRunners[0].rollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('does not process later rows when QueryRunner release fails after commit', async () => {
      failNextRelease = true;

      await expect(
        service.importDiscs(
          await createWorkbookBuffer([
            {
              name: 'Discos',
              rows: [
                ['header'],
                ['', 'Artist', 'Committed'],
                ['', 'Artist', 'Must not continue'],
              ],
            },
          ]),
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(queryRunners).toHaveLength(1);
      expect(queryRunners[0].commitTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunners[0].release).toHaveBeenCalledTimes(1);
      expect(discRepo.save).toHaveBeenCalledTimes(1);
    });

    it('reuses a preexisting Artist without changing it when Disc persistence fails', async () => {
      artistRepo.findOne.mockResolvedValue({
        id: 'artist-existing',
        name: 'Artist',
      });
      discRepo.save.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('private SQL detail'), { code: '23503' }),
        ),
      );

      const result = await service.importDiscs(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [['header'], ['', 'Artist', 'Fails']],
          },
        ]),
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        status: 'failed',
        reasonCode: 'PERSISTENCE_FAILED',
        artistId: 'artist-existing',
      });
      expect(artistRepo.save).not.toHaveBeenCalled();
      expect(queryRunners[0].rollbackTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
