import * as ExcelJS from 'exceljs';
import {
  ExcelWorkbookParser,
  InvalidExcelWorkbookError,
} from './excel-workbook.parser';

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
    ).rejects.toBeInstanceOf(InvalidExcelWorkbookError);
  });

  it('classifies non-XLSX input and a truncated ZIP workbook as invalid workbooks', async () => {
    await expect(
      parser.parse(Buffer.from('not an xlsx')),
    ).rejects.toBeInstanceOf(InvalidExcelWorkbookError);

    const workbookBuffer = await createWorkbookBuffer([
      { name: 'Discos', rows: [['header'], ['', 'Artist', 'Album']] },
    ]);
    await expect(
      parser.parse(workbookBuffer.subarray(0, workbookBuffer.length - 10)),
    ).rejects.toBeInstanceOf(InvalidExcelWorkbookError);
  });

  it.each([
    [new Error('1:3: text data outside of root node.')],
    [new Error('1:29: unexpected close tag.')],
    [new Error('1:16: disallowed character.')],
    [new Error('1:22: undefined entity.')],
    [new Error('1:35: unmatched closing tag: workbook.')],
    [new TypeError("Cannot read properties of undefined (reading 'sheets')")],
    [new TypeError("Cannot set properties of undefined (setting 'sheetNo')")],
  ])(
    'classifies a recognized malformed workbook structure as invalid',
    async (error) => {
      const workbookBuffer = await createWorkbookBuffer([
        { name: 'Discos', rows: [['header'], ['', 'Artist', 'Album']] },
      ]);
      const xlsxSpy = jest
        .spyOn(ExcelJS.Workbook.prototype, 'xlsx', 'get')
        .mockReturnValue({
          read: jest.fn().mockRejectedValue(error),
        } as never);

      try {
        await expect(parser.parse(workbookBuffer)).rejects.toBeInstanceOf(
          InvalidExcelWorkbookError,
        );
      } finally {
        xlsxSpy.mockRestore();
      }
    },
  );

  it('preserves an unexpected ExcelJS parsing error as an internal error', async () => {
    const workbookBuffer = await createWorkbookBuffer([
      { name: 'Discos', rows: [['header'], ['', 'Artist', 'Album']] },
    ]);
    const internalError = new Error('unexpected parser failure');
    const xlsxSpy = jest
      .spyOn(ExcelJS.Workbook.prototype, 'xlsx', 'get')
      .mockReturnValue({
        read: jest.fn().mockRejectedValue(internalError),
      } as never);

    try {
      await expect(parser.parse(workbookBuffer)).rejects.toBe(internalError);
    } finally {
      xlsxSpy.mockRestore();
    }
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

  it('preserves empty optional dates without marking them invalid', async () => {
    const rows = await parser.parse(
      await createWorkbookBuffer([
        {
          name: 'Discos',
          rows: [
            ['header'],
            ['', 'Artist', 'Empty date'],
            ['  ', 'Artist', 'Whitespace date'],
            [null, 'Artist', 'Null date'],
          ],
        },
      ]),
    );

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.releaseDate).toBeNull();
      expect(row).not.toHaveProperty('releaseDateError');
    }
  });

  it.each([
    ['unreadable text', 'not a date'],
    ['impossible day in day-first text', '31/02/2026'],
    ['impossible month in day-first text', '05/13/2026'],
    ['impossible day in ISO text', '2026-02-31'],
    ['impossible day in month-name text', 'February 31, 2026'],
    ['unsupported boolean cell', true],
    ['unsupported object cell', { formula: 'TODAY()', result: 'not a date' }],
  ])('marks %s as invalid instead of an empty date', async (_label, value) => {
    const rows = await parser.parse(
      await createWorkbookBuffer([
        {
          name: 'Discos',
          rows: [['header'], [value, 'Artist', 'Album']],
        },
      ]),
    );

    expect(rows[0]).toMatchObject({
      releaseDate: null,
      releaseDateError: 'INVALID_DATE',
    });
  });

  it('reads a numeric Excel date serial as a valid date when ExcelJS identifies the cell as a date', async () => {
    const rows = await parser.parse(
      await createWorkbookBuffer([
        {
          name: 'Discos',
          rows: [['header'], [45292, 'Artist', 'Album']],
          dateFormatRows: [2],
        },
      ]),
    );

    expect(rows[0].releaseDate).toEqual(new Date(Date.UTC(2024, 0, 1)));
    expect(rows[0]).not.toHaveProperty('releaseDateError');
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
