import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import { PassThrough, Writable } from 'stream';
import { randomUUID } from 'node:crypto';
import { CatalogImportController } from '../../import/manual/controller/catalog-import.controller';
import { CatalogImportService } from '../../import/manual/import/catalog-import.service';
import { ManualImportLogger } from '../../import/manual/logging/manual-import-logger';
import { ExcelController } from '../../import/excel/controller/excel.controller';
import { ExcelImportService } from '../../import/excel/import/excel-import.service';
import { ExcelTemplateService } from '../../import/excel/template/excel-template.service';
import { ExcelWorkbookParser } from '../../import/excel/parser/excel-workbook.parser';
import { InvalidExcelWorkbookError } from '../../import/excel/parser/excel-workbook.parser';
import { ProcessManualDataDto } from '../../import/manual/dto/process-manual-data.dto';
import { DiscWriteService } from '../write/disc-write.service';
import { CreateDiscDto } from '../dto/create-discs.dto';
import { CreateDiscWithArtistDto } from '../dto/create-disc-with-artist.dto';
import { Artist } from '../../artists/entities/artist.entity';
import { Country } from '../../countries/entities/country.entity';
import { Disc } from '../entities/disc.entity';
import { Genre } from '../../genres/entities/genre.entity';

const describePostgres =
  process.env.CATALOG_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

function createWriteStreamFixture() {
  return Object.assign(
    new Writable({ write: (_chunk, _encoding, callback) => callback() }),
    {
      close: jest.fn(),
      path: 'manual_data.log',
      bytesWritten: 0,
      pending: false,
    },
  );
}

describePostgres('Catalog persistence with PostgreSQL', () => {
  let dataSource: import('typeorm').DataSource;
  let country: Country;
  let genre: Genre;
  let fixturePrefix: string;
  let fixtureArtists: string[] = [];
  let discWriteService: DiscWriteService;
  let manualService: CatalogImportService;
  let excelService: ExcelImportService;
  let manualController: CatalogImportController;
  let excelController: ExcelController;

  beforeAll(async () => {
    if (
      process.env.STAGE !== 'dev' ||
      process.env.DB_HOST !== '127.0.0.1' ||
      process.env.DB_PORT !== '55432' ||
      process.env.DB_NAME !== 'riffvalley_catalog_test_20261015' ||
      process.env.DB_USERNAME !== 'riffvalley_catalog_test' ||
      !process.env.CATALOG_TEST_DB_PASSWORD ||
      process.env.DATABASE_URL
    ) {
      throw new Error(
        'Catalog PostgreSQL integration target is not the disposable test database.',
      );
    }
    process.env.DB_PASSWORD = process.env.CATALOG_TEST_DB_PASSWORD;

    const { default: configuredDataSource } = await import(
      '../../../data-source'
    );
    dataSource = configuredDataSource;
    dataSource.setOptions({
      installExtensions: false,
      logging: false,
      migrations: [],
      migrationsRun: false,
      synchronize: false,
    });
    await dataSource.initialize();

    const [identity] = (await dataSource.query(`
      SELECT current_database() AS database,
             current_user AS username,
             pg_get_userbyid(datdba) AS owner,
             inet_server_port() AS port
      FROM pg_database
      WHERE datname = current_database()
    `)) as Array<{
      database: string;
      username: string;
      owner: string;
      port: number;
    }>;
    if (
      identity?.database !== 'riffvalley_catalog_test_20261015' ||
      identity.username !== 'riffvalley_catalog_test' ||
      identity.owner !== 'riffvalley_catalog_test' ||
      Number(identity.port) !== 5432
    ) {
      throw new Error(
        'PostgreSQL identity did not match the disposable test database.',
      );
    }

    fixturePrefix = `BC-CAT-REG-4 ${randomUUID()}`;
    country = await dataSource.getRepository(Country).save({
      name: `${fixturePrefix} Country`,
      isoCode: 'TST',
    });
    genre = await dataSource.getRepository(Genre).save({
      name: `${fixturePrefix.slice(0, 38)} Genre`,
      color: '#123456',
    });

    discWriteService = new DiscWriteService(dataSource.getRepository(Disc));
    const writeStreamSpy = jest
      .spyOn(fs, 'createWriteStream')
      .mockReturnValue(createWriteStreamFixture());
    let manualLogger: ManualImportLogger;
    try {
      manualLogger = new ManualImportLogger();
    } finally {
      writeStreamSpy.mockRestore();
    }
    manualService = new CatalogImportService(
      dataSource,
      dataSource.getRepository(Country),
      dataSource.getRepository(Genre),
      manualLogger,
    );
    excelService = new ExcelImportService(
      dataSource,
      dataSource.getRepository(Genre),
      dataSource.getRepository(Country),
      new ExcelWorkbookParser(),
    );
    manualController = new CatalogImportController(manualService);
    excelController = new ExcelController(
      excelService,
      new ExcelTemplateService(
        dataSource.getRepository(Genre),
        dataSource.getRepository(Country),
      ),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (fixturePrefix) {
        const ownedArtists = (await dataSource.query(
          'SELECT id FROM artist WHERE name ILIKE $1',
          [`${fixturePrefix}%`],
        )) as Array<{ id: string }>;
        fixtureArtists = [
          ...new Set([...fixtureArtists, ...ownedArtists.map(({ id }) => id)]),
        ];
      }
      if (fixtureArtists.length > 0) {
        await dataSource.query(
          'DELETE FROM disc WHERE "artistId" = ANY($1::uuid[])',
          [fixtureArtists],
        );
        await dataSource.query(
          'DELETE FROM artist WHERE id = ANY($1::uuid[])',
          [fixtureArtists],
        );
      }
      if (genre?.id) {
        await dataSource.getRepository(Genre).delete({ id: genre.id });
      }
      if (country?.id) {
        await dataSource.getRepository(Country).delete({ id: country.id });
      }
      await dataSource.destroy();
    }
  });

  async function artistCountByName(name: string): Promise<number> {
    const rows = (await dataSource.query(
      'SELECT COUNT(*)::int AS count FROM artist WHERE name = $1',
      [name],
    )) as Array<{ count: number }>;
    return Number(rows[0].count);
  }

  it('persists Disc foreign keys, creates and reuses Artist, and rolls back a newly created Artist on Disc failure', async () => {
    const explicitArtist = await dataSource.getRepository(Artist).save({
      name: `${fixturePrefix} Direct Artist`,
      nameNormalized: `${fixturePrefix} Direct Artist`.toLowerCase(),
      countryId: country.id,
    });
    fixtureArtists.push(explicitArtist.id);

    const created = await discWriteService.create(
      Object.assign(new CreateDiscDto(), {
        name: `${fixturePrefix} Direct Disc`,
        artistId: explicitArtist.id,
        genreId: genre.id,
      }),
    );
    const [persistedDirect] = (await dataSource.query(
      'SELECT "artistId", "genreId" FROM disc WHERE id = $1',
      [created.id],
    )) as Array<{ artistId: string; genreId: string }>;
    expect(persistedDirect).toEqual({
      artistId: explicitArtist.id,
      genreId: genre.id,
    });

    const newArtistName = `${fixturePrefix} New Artist`;
    const withNewArtist = await discWriteService.createWithArtist(
      Object.assign(new CreateDiscWithArtistDto(), {
        artistName: newArtistName,
        discName: `${fixturePrefix} New Artist Disc`,
        countryId: country.id,
        genreId: genre.id,
      }),
    );
    expect(withNewArtist.artist.name).toBe(newArtistName);
    fixtureArtists.push(withNewArtist.artist.id);
    const persistedNew = await dataSource.getRepository(Disc).findOneOrFail({
      where: { id: withNewArtist.id },
    });
    expect(persistedNew.artist.id).toBe(withNewArtist.artist.id);
    expect(persistedNew.genre.id).toBe(genre.id);

    const reusedArtist = await discWriteService.createWithArtist(
      Object.assign(new CreateDiscWithArtistDto(), {
        artistName: newArtistName,
        discName: `${fixturePrefix} Reused Artist Disc`,
        countryId: country.id,
        genreId: genre.id,
      }),
    );
    expect(reusedArtist.artist.id).toBe(withNewArtist.artist.id);

    const rolledBackArtistName = `${fixturePrefix} Rollback Artist`;
    await expect(
      discWriteService.createWithArtist(
        Object.assign(new CreateDiscWithArtistDto(), {
          artistName: rolledBackArtistName,
          discName: `${fixturePrefix} Invalid Genre Disc`,
          countryId: country.id,
          genreId: randomUUID(),
        }),
      ),
    ).rejects.toThrow();
    expect(await artistCountByName(rolledBackArtistName)).toBe(0);

    const existingArtistName = explicitArtist.name;
    await expect(
      discWriteService.createWithArtist(
        Object.assign(new CreateDiscWithArtistDto(), {
          artistName: existingArtistName,
          discName: `${fixturePrefix} Existing Artist Rollback Disc`,
          countryId: country.id,
          genreId: randomUUID(),
        }),
      ),
    ).rejects.toThrow();
    expect(await artistCountByName(existingArtistName)).toBe(1);
  });

  it('imports Manual rows partially, returns data.results, preserves earlier success and rolls back a failed new Artist', async () => {
    const validLine = `${fixturePrefix} Manual Artist - ${fixturePrefix} Manual Disc`;
    const recoverableLine = `${fixturePrefix} Manual Rollback Artist - ${'x'.repeat(101)}`;
    const manualImportDto: ProcessManualDataDto = {
      date: 'October 4, 2026',
      albums: [
        { line: validLine, genreId: genre.id, countryId: country.id },
        { line: validLine, genreId: genre.id, countryId: country.id },
        { line: 'invalid line without separator' },
        { line: recoverableLine, genreId: genre.id, countryId: country.id },
        {
          line: `${fixturePrefix} Manual Later Artist - ${fixturePrefix} Manual Later Disc`,
          genreId: genre.id,
          countryId: country.id,
        },
      ],
    };
    const response = await manualController.processManualData(manualImportDto);

    expect(response.data.results.map(({ status }) => status)).toEqual([
      'imported',
      'duplicate',
      'failed',
      'failed',
      'imported',
    ]);
    expect(response.data.results[2]).toMatchObject({
      reasonCode: 'INVALID_INPUT',
    });
    expect(response.data.results[3]).toMatchObject({
      reasonCode: 'PERSISTENCE_FAILED',
    });
    fixtureArtists.push(
      response.data.results[0].artistId,
      response.data.results[4].artistId,
    );
    expect(
      await artistCountByName(`${fixturePrefix} Manual Rollback Artist`),
    ).toBe(0);
    await expect(
      manualService.processManualData({
        date: 'Invalid date',
        albums: [],
      }),
    ).rejects.toThrow('La fecha debe ser válida');
  });

  it('imports Excel rows partially with invalid dates and recoverable persistence errors, returning data.results', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Catalog');
    worksheet.addRow([
      'Fecha',
      'Artista',
      'Disco',
      'Género',
      'País',
      'Debut',
      'EP',
    ]);
    const valid = [
      '2026-10-04',
      `${fixturePrefix} Excel Artist`,
      `${fixturePrefix} Excel Disc`,
      genre.name,
      country.name,
      'No',
      'No',
    ];
    worksheet.addRow(valid);
    worksheet.addRow(valid);
    worksheet.addRow([
      'not-a-date',
      `${fixturePrefix} Invalid Date Artist`,
      `${fixturePrefix} Invalid Date Disc`,
      genre.name,
      country.name,
      'No',
      'No',
    ]);
    worksheet.addRow([
      '2026-10-04',
      `${fixturePrefix} Excel Rollback Artist`,
      'x'.repeat(101),
      genre.name,
      country.name,
      'No',
      'No',
    ]);
    worksheet.addRow([
      '2026-10-04',
      `${fixturePrefix} Excel Later Artist`,
      `${fixturePrefix} Excel Later Disc`,
      genre.name,
      country.name,
      'No',
      'No',
    ]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const upload: Express.Multer.File = {
      fieldname: 'file',
      buffer,
      stream: new PassThrough(),
      originalname: 'catalog-test.xlsx',
      encoding: '7bit',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      destination: '',
      filename: 'catalog-test.xlsx',
      path: '',
    };
    const response = await excelController.uploadTemplate(upload);

    expect(response.data.results.map(({ status }) => status)).toEqual([
      'imported',
      'duplicate',
      'failed',
      'failed',
      'imported',
    ]);
    expect(response.data.results[2]).toMatchObject({
      reasonCode: 'INVALID_INPUT',
    });
    expect(response.data.results[3]).toMatchObject({
      reasonCode: 'PERSISTENCE_FAILED',
    });
    fixtureArtists.push(
      response.data.results[0].artistId,
      response.data.results[4].artistId,
    );
    expect(
      await artistCountByName(`${fixturePrefix} Excel Rollback Artist`),
    ).toBe(0);
    await expect(
      excelService.importDiscs(Buffer.from('not-an-xlsx')),
    ).rejects.toBeInstanceOf(InvalidExcelWorkbookError);
  });

  it('persists successful rows from both import formats after recoverable row failures', async () => {
    const discNames = [
      `${fixturePrefix} Manual Disc`,
      `${fixturePrefix} Manual Later Disc`,
      `${fixturePrefix} Excel Disc`,
      `${fixturePrefix} Excel Later Disc`,
    ];
    const persisted = await dataSource
      .getRepository(Disc)
      .createQueryBuilder('disc')
      .where('disc.name IN (:...discNames)', { discNames })
      .getMany();
    expect(persisted.map(({ name }) => name).sort()).toEqual(discNames.sort());
  });
});
