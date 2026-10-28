import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Genre } from '../../../genres/entities/genre.entity';
import { Country } from '../../../countries/entities/country.entity';
import { Disc } from '../../../discs/entities/disc.entity';
import { Artist } from '../../../artists/entities/artist.entity';
import { normalizeForSearch } from '../../../artists/helpers/normalize-for-search';
import { normalizeMusicName } from '../../../shared/music-name/normalize-music-name';
import {
  CatalogImportTransactionError,
  runCatalogImportTransaction,
} from '../../transaction/catalog-import-transaction';
import {
  CatalogImportFailedResult,
  CatalogImportResultItem,
  CatalogImportResultsData,
} from '../../dto/catalog-import-result.types';
import {
  ExcelWorkbookParser,
  ParsedExcelRow,
} from '../parser/excel-workbook.parser';

const SAFE_GLOBAL_ERROR =
  'No se pudo completar la importación del archivo. Los resultados confirmados antes del fallo se conservan.';
const RECOVERABLE_ROW_SQLSTATES = new Set([
  '22001', // string_data_right_truncation
  '22003', // numeric_value_out_of_range
  '22007', // invalid_datetime_format
  '22008', // datetime_field_overflow
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23514', // check_violation
]);

function isRecoverableRowPersistenceError(
  error: unknown,
): error is QueryFailedError {
  if (!(error instanceof QueryFailedError)) return false;

  const code = (error.driverError as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && RECOVERABLE_ROW_SQLSTATES.has(code);
}

function failedResult(
  inputIndex: number,
  row: ParsedExcelRow,
  reasonCode: CatalogImportFailedResult['reasonCode'],
  message: string,
  artistId?: string,
): CatalogImportFailedResult {
  return {
    inputIndex,
    source: { kind: 'excel', sheet: row.sheet, rowNumber: row.rowNumber },
    status: 'failed',
    reasonCode,
    message,
    ...(row.artistName && { artistName: row.artistName }),
    ...(row.discName && { discName: row.discName }),
    ...(artistId && { artistId }),
  };
}

function safeGlobalError(): InternalServerErrorException {
  return new InternalServerErrorException(SAFE_GLOBAL_ERROR);
}

@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Genre)
    private genreRepo: Repository<Genre>,
    @InjectRepository(Country)
    private countryRepo: Repository<Country>,
    private readonly workbookParser: ExcelWorkbookParser,
  ) {}

  async importDiscs(fileBuffer: Buffer): Promise<CatalogImportResultsData> {
    const rows = await this.workbookParser.parse(fileBuffer);

    let genres: Genre[];
    let countries: Country[];
    try {
      genres = await this.genreRepo.find();
      countries = await this.countryRepo.find();
    } catch {
      throw safeGlobalError();
    }

    const genreMap = new Map(
      genres.map((genre) => [genre.name.toLowerCase(), genre]),
    );
    const countryMap = new Map(
      countries.map((country) => [country.name.toLowerCase(), country]),
    );
    const results: CatalogImportResultItem[] = [];

    let currentSheet: string | undefined;
    for (let inputIndex = 0; inputIndex < rows.length; inputIndex += 1) {
      const row = rows[inputIndex];
      const {
        sheet,
        rowNumber,
        releaseDate,
        artistName,
        discName,
        genreName,
        countryName,
        debut,
        ep,
      } = row;

      if (sheet !== currentSheet) {
        currentSheet = sheet;
        this.logger.log(`Procesando hoja: ${sheet}`);
      }

      if (row.releaseDateError === 'INVALID_DATE') {
        results.push(
          failedResult(
            inputIndex,
            row,
            'INVALID_INPUT',
            'El campo "Fecha" no contiene una fecha válida.',
          ),
        );
        continue;
      }

      if (!artistName) {
        results.push(
          failedResult(
            inputIndex,
            row,
            'INVALID_INPUT',
            'El campo "Artista" es obligatorio.',
          ),
        );
        continue;
      }
      if (!discName) {
        results.push(
          failedResult(
            inputIndex,
            row,
            'INVALID_INPUT',
            'El campo "Disco" es obligatorio.',
          ),
        );
        continue;
      }

      const genre = genreName
        ? genreMap.get(genreName.toLowerCase())
        : undefined;
      if (genreName && !genre) {
        results.push(
          failedResult(
            inputIndex,
            row,
            'REFERENCE_NOT_FOUND',
            'No se encontró el género indicado en el catálogo.',
          ),
        );
        continue;
      }

      const country = countryName
        ? countryMap.get(countryName.toLowerCase())
        : undefined;
      if (countryName && !country) {
        results.push(
          failedResult(
            inputIndex,
            row,
            'REFERENCE_NOT_FOUND',
            'No se encontró el país indicado en el catálogo.',
          ),
        );
        continue;
      }

      let result: {
        kind: 'duplicate' | 'imported';
        artistCreated: boolean;
        artist: Artist;
        disc: Disc;
      };
      let reusedArtistId: string | undefined;
      try {
        result = await runCatalogImportTransaction(
          this.dataSource,
          async (manager) => {
            const artistRepo = manager.getRepository(Artist);
            const discRepo = manager.getRepository(Disc);

            // Resolve or create Artist using the canonical key from Artists Write.
            const normalizedArtistName = normalizeForSearch(artistName);
            let artist = await artistRepo.findOne({
              where: {
                nameNormalized: normalizedArtistName,
                ...(country ? { countryId: country.id } : {}),
              },
            });

            let artistCreated = false;
            if (!artist) {
              artist = artistRepo.create({
                name: artistName,
                nameNormalized: normalizedArtistName,
                searchNameNormalized: normalizeMusicName(artistName),
                ...(country ? { countryId: country.id } : {}),
              });
              artist = await artistRepo.save(artist);
              artistCreated = true;
            } else {
              reusedArtistId = artist.id;
            }

            // Keep the exact Disc duplicate rule and optional date criterion.
            const existingDisc = await discRepo.findOne({
              where: {
                name: discName,
                artist: { id: artist.id },
                ...(releaseDate ? { releaseDate } : {}),
              },
            });

            if (existingDisc) {
              return {
                kind: 'duplicate' as const,
                artistCreated,
                artist,
                disc: existingDisc,
              };
            }

            const disc = discRepo.create({
              name: discName,
              searchNameNormalized: normalizeMusicName(discName),
              releaseDate,
              debut,
              ep,
              artist,
              ...(genre ? { genre } : {}),
            });
            const savedDisc = await discRepo.save(disc);

            return {
              kind: 'imported' as const,
              artistCreated,
              artist,
              disc: savedDisc,
            };
          },
        );
      } catch (error) {
        if (error instanceof CatalogImportTransactionError) {
          throw safeGlobalError();
        }
        if (isRecoverableRowPersistenceError(error)) {
          this.logger.error(
            `Fallo de persistencia recuperable en hoja ${sheet}, fila ${rowNumber}.`,
          );
          results.push(
            failedResult(
              inputIndex,
              row,
              'PERSISTENCE_FAILED',
              'No se pudo guardar esta fila por un problema con sus datos.',
              reusedArtistId,
            ),
          );
          continue;
        }
        throw safeGlobalError();
      }

      if (result.artistCreated) {
        this.logger.log(
          `Artista creado: "${artistName}" (Hoja: ${sheet}, fila ${rowNumber})`,
        );
      }

      if (result.kind === 'duplicate') {
        results.push({
          inputIndex,
          source: { kind: 'excel', sheet, rowNumber },
          status: 'duplicate',
          artistName,
          discName,
          artistId: result.artist.id,
          discId: result.disc.id,
          message: 'El disco ya existe y se ha omitido.',
        });
        continue;
      }

      results.push({
        inputIndex,
        source: { kind: 'excel', sheet, rowNumber },
        status: 'imported',
        artistName,
        discName,
        artistId: result.artist.id,
        discId: result.disc.id,
        message: 'Disco importado correctamente.',
      });
      this.logger.log(
        `Disco creado: "${discName}" - "${artistName}" (Hoja: ${sheet}, fila ${rowNumber})`,
      );
    }

    const counts = results.reduce(
      (totals, result) => {
        totals[result.status] += 1;
        return totals;
      },
      { imported: 0, duplicate: 0, failed: 0 },
    );
    this.logger.log(
      `Importación finalizada: ${counts.imported} importados, ${counts.duplicate} duplicados, ${counts.failed} fallidos`,
    );

    return { results };
  }
}
