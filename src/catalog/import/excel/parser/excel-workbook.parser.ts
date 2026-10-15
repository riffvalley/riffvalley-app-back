import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ParsedExcelRow {
  sheet: string;
  rowNumber: number;
  releaseDate: Date | null;
  releaseDateError?: 'INVALID_DATE';
  artistName: string;
  discName: string;
  genreName: string;
  countryName: string;
  debut: boolean;
  ep: boolean;
}

export class InvalidExcelWorkbookError extends Error {
  constructor() {
    super('El archivo no contiene un workbook Excel válido.');
    this.name = InvalidExcelWorkbookError.name;
  }
}

function isKnownWorkbookFormatError(error: unknown): boolean {
  if (!(error instanceof Error) || error instanceof RangeError) return false;

  const message = error.message;
  if (
    error instanceof TypeError &&
    (message === "Cannot read properties of undefined (reading 'sheets')" ||
      message === "Cannot set properties of undefined (setting 'sheetNo')")
  ) {
    return true;
  }
  if (error.constructor !== Error) return false;

  return [
    /^End of data reached \(data length = \d+, asked index = \d+\)\. Corrupted zip \?$/,
    /^Can't find end of central directory : is this a zip file \? If it is, see https:\/\/stuk\.github\.io\/jszip\/documentation\/howto\/read_zip\.html$/,
    /^Corrupted zip\b/,
    /^Multi-volumes zip are not supported$/,
    /^Encrypted zip are not supported$/,
    /^\d+:\d+: (?:text data outside of root node|unexpected close tag|disallowed character|undefined entity|unmatched closing tag(?:: .+)?)[.]$/,
  ].some((pattern) => pattern.test(message));
}

@Injectable()
export class ExcelWorkbookParser {
  async parse(fileBuffer: Buffer): Promise<ParsedExcelRow[]> {
    if (
      !Buffer.isBuffer(fileBuffer) ||
      fileBuffer.length === 0 ||
      (!fileBuffer.subarray(0, 4).equals(Buffer.from('PK\u0003\u0004')) &&
        !fileBuffer.subarray(0, 4).equals(Buffer.from('PK\u0005\u0006')))
    ) {
      throw new InvalidExcelWorkbookError();
    }

    const workbook = new ExcelJS.Workbook();
    // ExcelJS sometimes fails to read a raw multer Buffer directly through load().
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);
    try {
      await workbook.xlsx.read(bufferStream);
    } catch (error) {
      if (isKnownWorkbookFormatError(error)) {
        throw new InvalidExcelWorkbookError();
      }
      throw error;
    }

    if (workbook.worksheets.length === 0) {
      throw new InvalidExcelWorkbookError();
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

        const parsedDate = this.parseDate(values[1]);
        parsedRows.push({
          sheet: worksheet.name,
          rowNumber,
          releaseDate: parsedDate.releaseDate,
          ...(parsedDate.invalid && {
            releaseDateError: 'INVALID_DATE' as const,
          }),
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

  private parseDate(value: unknown): {
    releaseDate: Date | null;
    invalid: boolean;
  } {
    if (value === null || value === undefined) {
      return { releaseDate: null, invalid: false };
    }
    if (value instanceof Date) {
      return Number.isFinite(value.getTime())
        ? { releaseDate: value, invalid: false }
        : { releaseDate: null, invalid: true };
    }

    if (typeof value !== 'string') {
      return { releaseDate: null, invalid: true };
    }

    const dateString = value.trim();
    if (!dateString) return { releaseDate: null, invalid: false };

    const dayFirst = dateString.match(
      /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/,
    );
    if (dayFirst) {
      const date = this.createUtcDate(
        Number(dayFirst[3]),
        Number(dayFirst[2]),
        Number(dayFirst[1]),
      );
      return date
        ? { releaseDate: date, invalid: false }
        : { releaseDate: null, invalid: true };
    }

    const yearFirst = dateString.match(
      /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:$|[T ].*)/,
    );
    if (yearFirst) {
      if (
        !this.createUtcDate(
          Number(yearFirst[1]),
          Number(yearFirst[2]),
          Number(yearFirst[3]),
        )
      ) {
        return { releaseDate: null, invalid: true };
      }
    }

    const monthDate = dateString.match(
      /^(?:(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+.*)?$/i,
    );
    const dayMonthDate = dateString.match(
      /^(?:(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+.*)?$/i,
    );
    const namedDate = monthDate ?? dayMonthDate;
    if (namedDate) {
      const monthName = monthDate ? namedDate[1] : namedDate[2];
      const month = this.monthNumber(monthName);
      const day = Number(monthDate ? namedDate[2] : namedDate[1]);
      const year = Number(namedDate[3]);
      if (!month || !this.createUtcDate(year, month, day)) {
        return { releaseDate: null, invalid: true };
      }
    }

    const parsed = new Date(dateString);
    return Number.isFinite(parsed.getTime())
      ? { releaseDate: parsed, invalid: false }
      : { releaseDate: null, invalid: true };
  }

  private createUtcDate(year: number, month: number, day: number): Date | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  private monthNumber(monthName: string): number | undefined {
    const months = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    return months.indexOf(monthName.slice(0, 3).toLowerCase()) + 1 || undefined;
  }

  private parseFlag(value: unknown): boolean {
    const text = this.readText(value);
    return text ? text.toLowerCase() === 'si' : false;
  }
}
