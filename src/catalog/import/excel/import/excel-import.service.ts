import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from '../../../genres/entities/genre.entity';
import { Country } from '../../../countries/entities/country.entity';
import { Disc } from '../../../discs/entities/disc.entity';
import { Artist } from '../../../artists/entities/artist.entity';
import { ExcelWorkbookParser } from '../parser/excel-workbook.parser';

export interface ImportResult {
  created: number;
  errors: {
    row: number;
    disc: string;
    artist: string;
    error: string;
  }[];
}

@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  constructor(
    @InjectRepository(Genre)
    private genreRepo: Repository<Genre>,
    @InjectRepository(Country)
    private countryRepo: Repository<Country>,
    @InjectRepository(Disc)
    private discRepo: Repository<Disc>,
    @InjectRepository(Artist)
    private artistRepo: Repository<Artist>,
    private readonly workbookParser: ExcelWorkbookParser,
  ) {}

  async importDiscs(fileBuffer: Buffer): Promise<ImportResult> {
    const rows = await this.workbookParser.parse(fileBuffer);

    // Pre-load all genres and countries for fast lookup
    const genres = await this.genreRepo.find();
    const countries = await this.countryRepo.find();
    const genreMap = new Map(genres.map((g) => [g.name.toLowerCase(), g]));
    const countryMap = new Map(countries.map((c) => [c.name.toLowerCase(), c]));

    const errors: ImportResult['errors'] = [];
    let created = 0;

    let currentSheet: string | undefined;
    for (const row of rows) {
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

      // Preserve the importer rule: rows without Artist and Disc are silently skipped.
      if (!artistName && !discName) continue;

      try {
        // Validate required fields
        if (!artistName) {
          errors.push({
            row: rowNumber,
            disc: discName,
            artist: artistName,
            error: `[Hoja: ${sheet}] El campo "Artista" es obligatorio`,
          });
          continue;
        }
        if (!discName) {
          errors.push({
            row: rowNumber,
            disc: discName,
            artist: artistName,
            error: `[Hoja: ${sheet}] El campo "Disco" es obligatorio`,
          });
          continue;
        }

        // Resolve genre
        let genre: Genre | undefined;
        if (genreName) {
          genre = genreMap.get(genreName.toLowerCase());
          if (!genre) {
            errors.push({
              row: rowNumber,
              disc: discName,
              artist: artistName,
              error: `[Hoja: ${sheet}] Género "${genreName}" no encontrado en la base de datos`,
            });
            continue;
          }
        }

        // Resolve country
        let country: Country | undefined;
        if (countryName) {
          country = countryMap.get(countryName.toLowerCase());
          if (!country) {
            errors.push({
              row: rowNumber,
              disc: discName,
              artist: artistName,
              error: `[Hoja: ${sheet}] País "${countryName}" no encontrado en la base de datos`,
            });
            continue;
          }
        }

        // Resolve or create artist
        let artist = await this.artistRepo.findOne({
          where: {
            name: artistName,
            ...(country ? { countryId: country.id } : {}),
          },
        });

        if (!artist) {
          artist = this.artistRepo.create({
            name: artistName,
            nameNormalized: artistName.toLowerCase(),
            ...(country ? { countryId: country.id } : {}),
          });
          await this.artistRepo.save(artist);
          this.logger.log(
            `Artista creado: "${artistName}" (Hoja: ${sheet}, fila ${rowNumber})`,
          );
        }

        // Check for duplicate disc
        const existingDisc = await this.discRepo.findOne({
          where: {
            name: discName,
            artist: { id: artist.id },
            ...(releaseDate ? { releaseDate } : {}),
          },
        });

        if (existingDisc) {
          errors.push({
            row: rowNumber,
            disc: discName,
            artist: artistName,
            error: `[Hoja: ${sheet}] El disco ya existe en la base de datos`,
          });
          continue;
        }

        // Create disc
        const disc = this.discRepo.create({
          name: discName,
          releaseDate,
          debut,
          ep,
          artist,
          ...(genre ? { genre } : {}),
        });

        await this.discRepo.save(disc);
        created++;
        this.logger.log(
          `Disco creado: "${discName}" - "${artistName}" (Hoja: ${sheet}, fila ${rowNumber})`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          row: rowNumber,
          disc: discName,
          artist: artistName,
          error: `[Hoja: ${sheet}] ` + message,
        });
        this.logger.error(
          `Error en fila ${rowNumber} (Hoja: ${sheet}): ${message}`,
        );
      }
    }

    this.logger.log(
      `Importación finalizada: ${created} discos creados, ${errors.length} errores`,
    );
    return { created, errors };
  }
}
