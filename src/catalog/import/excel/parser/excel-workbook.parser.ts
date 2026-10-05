import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ParsedExcelRow {
  sheet: string;
  rowNumber: number;
  releaseDate: Date | null;
  artistName: string;
  discName: string;
  genreName: string;
  countryName: string;
  debut: boolean;
  ep: boolean;
}

@Injectable()
export class ExcelWorkbookParser {
  async parse(fileBuffer: Buffer): Promise<ParsedExcelRow[]> {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS sometimes fails to read a raw multer Buffer directly through load().
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);
    await workbook.xlsx.read(bufferStream);

    if (workbook.worksheets.length === 0) {
      throw new Error('El archivo Excel está vacío o no tiene hojas legibles');
    }

    const parsedRows: ParsedExcelRow[] = [];
    for (const worksheet of workbook.worksheets) {
      if (worksheet.state === 'hidden' || worksheet.state === 'veryHidden')
        continue;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        // ExcelJS row.values is 1-indexed: [undefined, col1, col2, ...].
        const values = row.values as unknown[];
        const artistName = this.readText(values[2]);
        const discName = this.readText(values[3]);
        const genreName = this.readText(values[4]);
        const countryName = this.readText(values[5]);

        // eachRow omits empty worksheet rows; keep this explicit for sparse row values too.
        if (
          values
            .slice(1, 8)
            .every(
              (value) => value === null || value === undefined || value === '',
            )
        )
          return;

        parsedRows.push({
          sheet: worksheet.name,
          rowNumber,
          releaseDate: this.parseDate(values[1]),
          artistName,
          discName,
          genreName,
          countryName,
          debut: this.parseFlag(values[6]),
          ep: this.parseFlag(values[7]),
        });
      });
    }

    return parsedRows;
  }

  private readText(value: unknown): string {
    return value ? String(value).trim() : '';
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    const dateString = String(value).trim();
    const match = dateString.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      return new Date(Date.UTC(year, month, day));
    }

    const parsed = new Date(dateString);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseFlag(value: unknown): boolean {
    const text = this.readText(value);
    return text ? text.toLowerCase() === 'si' : false;
  }
}
