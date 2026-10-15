import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, QueryFailedError, Repository } from 'typeorm';
import { isUUID } from 'class-validator';

import { ProcessManualDataDto } from '../dto/process-manual-data.dto';
import { parseManualAlbumLine } from '../parser/parse-manual-album-line';
import { parseManualDate } from '../parser/parse-manual-date';
import { normalizeForSearch } from '../../../artists/helpers/normalize-for-search';
import { ManualImportLogger } from '../logging/manual-import-logger';
import { Artist } from '../../../artists/entities/artist.entity';
import { Disc } from '../../../discs/entities/disc.entity';
import { Country } from '../../../countries/entities/country.entity';
import { Genre } from '../../../genres/entities/genre.entity';
import {
  CatalogImportTransactionError,
  runCatalogImportTransaction,
} from '../../catalog-import-transaction';
import {
  CatalogImportFailedResult,
  CatalogImportResultItem,
  CatalogImportResultsData,
} from '../../dto/catalog-import-result.types';

const SAFE_GLOBAL_ERROR =
  'No se pudo completar la importación. Los discos confirmados antes del fallo se conservan.';
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
  inputLine: string | undefined,
  reasonCode: CatalogImportFailedResult['reasonCode'],
  message: string,
  names?: { artistName: string; discName: string },
): CatalogImportFailedResult {
  return {
    inputIndex,
    source: { kind: 'manual', ...(inputLine !== undefined && { inputLine }) },
    status: 'failed',
    reasonCode,
    message,
    ...names,
  };
}

function safeGlobalError(): InternalServerErrorException {
  return new InternalServerErrorException(SAFE_GLOBAL_ERROR);
}

@Injectable()
export class CatalogImportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,

    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
    private readonly manualImportLogger: ManualImportLogger,
  ) {}

  async processManualData(
    dto: ProcessManualDataDto,
  ): Promise<CatalogImportResultsData> {
    const { date, albums } = dto;
    this.manualImportLogger.log(`Processing manual data for date: ${date}`);

    const releaseDate = parseManualDate(date);

    if (!releaseDate) {
      this.manualImportLogger.log(`Invalid date provided: ${date}`);
      throw new BadRequestException(
        'La fecha debe ser válida y usar el formato "October 4, 2026".',
      );
    }

    let defaultCountry: Country | null;
    try {
      defaultCountry = await this.countryRepository.findOne({
        where: { name: 'Sin pais' },
      });
    } catch {
      throw safeGlobalError();
    }

    const results: CatalogImportResultItem[] = [];

    for (let inputIndex = 0; inputIndex < albums.length; inputIndex += 1) {
      const album = albums[inputIndex];
      const albumLine: unknown = album.line;
      const rawGenreId: unknown = album.genreId;
      const rawCountryId: unknown = album.countryId;
      const rawEp: unknown = album.ep;
      const rawDebut: unknown = album.debut;
      const sourceLine = typeof albumLine === 'string' ? albumLine : undefined;

      const hasValidOptionalId = (value: unknown) =>
        value == null || (typeof value === 'string' && isUUID(value));
      if (
        typeof albumLine !== 'string' ||
        !hasValidOptionalId(rawGenreId) ||
        !hasValidOptionalId(rawCountryId) ||
        (rawEp != null && typeof rawEp !== 'boolean') ||
        (rawDebut != null && typeof rawDebut !== 'boolean')
      ) {
        results.push(
          failedResult(
            inputIndex,
            sourceLine,
            'INVALID_INPUT',
            'La entrada debe incluir una línea de artista y disco.',
          ),
        );
        continue;
      }

      const genreId = typeof rawGenreId === 'string' ? rawGenreId : undefined;
      const countryId =
        typeof rawCountryId === 'string' ? rawCountryId : undefined;
      const ep = typeof rawEp === 'boolean' ? rawEp : false;
      const debut = typeof rawDebut === 'boolean' ? rawDebut : false;

      const parsedLine = parseManualAlbumLine(albumLine);
      if (parsedLine.kind === 're-release') {
        this.manualImportLogger.log(
          `Skipping album (Re-Release): ${albumLine}`,
        );
        results.push(
          failedResult(
            inputIndex,
            sourceLine,
            'RE_RELEASE',
            'El disco está marcado como re-release y no se ha importado.',
          ),
        );
        continue;
      }

      if (parsedLine.kind === 'invalid') {
        this.manualImportLogger.log(`Unexpected format: ${albumLine}`);
        results.push(
          failedResult(
            inputIndex,
            sourceLine,
            'INVALID_INPUT',
            'La línea debe incluir el nombre del artista y el título del disco.',
          ),
        );
        continue;
      }

      const { artistName, discName } = parsedLine;

      if (!artistName.trim() || !discName.trim()) {
        results.push(
          failedResult(
            inputIndex,
            sourceLine,
            'INVALID_INPUT',
            'La línea debe incluir el nombre del artista y el título del disco.',
          ),
        );
        continue;
      }

      let genre: Genre | null;
      let country: Country | null;
      try {
        [genre, country] = await Promise.all([
          genreId
            ? this.genreRepository.findOne({ where: { id: genreId } })
            : Promise.resolve(null),
          countryId
            ? this.countryRepository.findOne({ where: { id: countryId } })
            : Promise.resolve(null),
        ]);
      } catch {
        throw safeGlobalError();
      }

      if ((genreId && !genre) || (countryId && !country)) {
        this.manualImportLogger.log(
          `Reference not found for album: ${albumLine}`,
        );
        results.push(
          failedResult(
            inputIndex,
            sourceLine,
            'REFERENCE_NOT_FOUND',
            'El género o país indicado ya no existe. Revisa las referencias de esta entrada.',
            { artistName, discName },
          ),
        );
        continue;
      }

      let result: { kind: 'existing' | 'saved'; artist: Artist; disc: Disc };
      try {
        result = await runCatalogImportTransaction(
          this.dataSource,
          async (manager) => {
            const artistRepository = manager.getRepository(Artist);
            const discRepository = manager.getRepository(Disc);
            const normalizedArtistName = normalizeForSearch(artistName);
            let artist = await artistRepository.findOne({
              where: { nameNormalized: normalizedArtistName },
            });

            if (!artist) {
              artist = artistRepository.create({
                name: artistName,
                nameNormalized: normalizedArtistName,
                description: '',
                image: '',
                country: country ?? defaultCountry ?? undefined,
              } as Partial<Artist>);
              artist = await artistRepository.save(artist);
            }

            // Keep the existing case-insensitive Disc duplicate rule unchanged.
            const existingDisc = await discRepository.findOne({
              where: {
                name: ILike(discName.trim()),
                artist: { id: artist.id },
              },
            });

            if (existingDisc) {
              return { kind: 'existing' as const, artist, disc: existingDisc };
            }

            const disc = discRepository.create({
              name: discName,
              description: '',
              image: '',
              verified: false,
              link: '',
              artist,
              ...(genre && { genre }),
              ep,
              debut,
              releaseDate: releaseDate ?? null,
            });
            const savedDisc = await discRepository.save(disc);

            return { kind: 'saved' as const, artist, disc: savedDisc };
          },
        );
      } catch (error) {
        if (error instanceof CatalogImportTransactionError) {
          throw safeGlobalError();
        }
        if (isRecoverableRowPersistenceError(error)) {
          results.push(
            failedResult(
              inputIndex,
              sourceLine,
              'PERSISTENCE_FAILED',
              'No se pudo guardar esta entrada por un problema con sus datos.',
              { artistName, discName },
            ),
          );
          continue;
        }
        throw safeGlobalError();
      }

      if (result.kind === 'saved') {
        this.manualImportLogger.log(
          `Processed: Artist "${artistName}" => Disc "${discName}" => Date: ${releaseDate}`,
        );
        results.push({
          inputIndex,
          source: { kind: 'manual', inputLine: albumLine },
          status: 'imported',
          artistName,
          discName,
          artistId: result.artist.id,
          discId: result.disc.id,
          message: 'Disco importado correctamente.',
        });
      } else {
        this.manualImportLogger.log(
          `Already exists: Artist "${artistName}" => Disc "${discName}"`,
        );
        results.push({
          inputIndex,
          source: { kind: 'manual', inputLine: albumLine },
          status: 'duplicate',
          artistName,
          discName,
          artistId: result.artist.id,
          discId: result.disc.id,
          message: 'El disco ya existe y se ha omitido.',
        });
      }
    }

    return { results };
  }
}
