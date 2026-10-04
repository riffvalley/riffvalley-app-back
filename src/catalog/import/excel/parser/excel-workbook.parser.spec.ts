import * as ExcelJS from 'exceljs';
import { ExcelWorkbookParser } from './excel-workbook.parser';

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

async function createEmptyWorkbookBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('ExcelWorkbookParser', () => {
  let parser: ExcelWorkbookParser;

  beforeEach(() => {
    parser = new ExcelWorkbookParser();
  });

  it('rejects a workbook with no worksheets', async () => {
    await expect(
      parser.parse(await createEmptyWorkbookBuffer()),
    ).rejects.toThrow('El archivo Excel está vacío o no tiene hojas legibles');
  });

  it('processes visible sheets in order, ignores hidden sheets and the first row', async () => {
    const rows = await parser.parse(
      await createWorkbookBuffer([
        {
          name: 'Visible one',
          rows: [
            ['not', 'validated', 'as', 'headers', 'here', 'either', 'way'],
            ['01.01.2021', 'First Artist', 'First Disc'],
          ],
        },
        {
          name: 'Hidden',
          state: 'hidden',
          rows: [['header'], ['', 'Hidden Artist', 'Hidden Disc']],
        },
        {
          name: 'Very hidden',
          state: 'veryHidden',
          rows: [['header'], ['', 'Hidden Artist 2', 'Hidden Disc 2']],
        },
        {
          name: 'Visible two',
          rows: [['different header'], ['', 'Second Artist', 'Second Disc']],
        },
      ]),
    );

    expect(
      rows.map(({ sheet, rowNumber, artistName, discName }) => ({
        sheet,
        rowNumber,
        artistName,
        discName,
      })),
    ).toEqual([
      {
        sheet: 'Visible one',
        rowNumber: 2,
        artistName: 'First Artist',
        discName: 'First Disc',
      },
      {
        sheet: 'Visible two',
        rowNumber: 2,
        artistName: 'Second Artist',
        discName: 'Second Disc',
      },
    ]);
  });

  it('reads the seven positional columns and trims string values without interpreting headers', async () => {
    const rows = await parser.parse(
      await createWorkbookBuffer([
        {
          name: 'Arbitrary headers',
          rows: [
            ['Fecha', 'Artista', 'Disco', 'Género', 'País', 'Debut', 'EP'],
            [
              '02/01/2020',
              ' Artist ',
              ' Album ',
              ' rOcK ',
              ' sPaIn ',
              ' si ',
              'No',
            ],
          ],
        },
      ]),
    );

    expect(rows).toEqual([
      {
        sheet: 'Arbitrary headers',
        rowNumber: 2,
        releaseDate: new Date(Date.UTC(2020, 0, 2)),
        artistName: 'Artist',
        discName: 'Album',
        genreName: 'rOcK',
        countryName: 'sPaIn',
        debut: true,
        ep: false,
      },
    ]);
  });

  it('converts other Excel cell values to trimmed text and omits completely empty rows', async () => {
    const rows = await parser.parse(
      await createWorkbookBuffer([
        {
          name: 'Discos',
          rows: [
            ['header'],
            ['', '', '', '', '', '', ''],
            [null, 123, true, ' Genre ', ' Country ', 1, false],
          ],
        },
      ]),
    );

    expect(rows).toEqual([
      {
        sheet: 'Discos',
        rowNumber: 3,
        releaseDate: null,
        artistName: '123',
        discName: 'true',
        genreName: 'Genre',
        countryName: 'Country',
        debut: false,
        ep: false,
      },
    ]);
  });

  it.each([
    [
      'native Excel Date',
      new Date(Date.UTC(2022, 3, 5)),
      new Date(Date.UTC(2022, 3, 5)),
    ],
    ['DD.MM.YYYY', '05.04.2022', new Date(Date.UTC(2022, 3, 5))],
    ['DD/MM/YYYY', '05/04/2022', new Date(Date.UTC(2022, 3, 5))],
    ['DD-MM-YYYY', '05-04-2022', new Date(Date.UTC(2022, 3, 5))],
    ['new Date parseable text', 'April 5, 2022', new Date('April 5, 2022')],
  ])('parses %s as a release date', async (_label, dateValue, expectedDate) => {
    const rows = await parser.parse(
      await createWorkbookBuffer([
        {
          name: 'Discos',
          rows: [['header'], [dateValue, 'Artist', 'Album']],
        },
      ]),
    );

    expect(rows[0].releaseDate).toEqual(expectedDate);
  });

  it('converts an unparseable date to null', async () => {
    const rows = await parser.parse(
      await createWorkbookBuffer([
        {
          name: 'Discos',
          rows: [['header'], ['not a date', 'Artist', 'Album']],
        },
      ]),
    );

    expect(rows[0].releaseDate).toBeNull();
  });

  it.each([
    ['si', true],
    ['Si', true],
    ['SI', true],
    ['yes', false],
    ['Sí', false],
    ['no', false],
    ['', false],
  ])(
    'interprets flag value %j as %s for Debut and EP',
    async (flagValue, expected) => {
      const rows = await parser.parse(
        await createWorkbookBuffer([
          {
            name: 'Discos',
            rows: [
              ['header'],
              ['', 'Artist', 'Album', '', '', flagValue, flagValue],
            ],
          },
        ]),
      );

      expect(rows[0]).toEqual(
        expect.objectContaining({ debut: expected, ep: expected }),
      );
    },
  );
});
