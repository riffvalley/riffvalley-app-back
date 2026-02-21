import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from '../genres/entities/genre.entity';
import { Country } from '../countries/entities/country.entity';
import { Disc } from '../discs/entities/disc.entity';
import { Artist } from '../artists/entities/artist.entity';
import * as ExcelJS from 'exceljs';

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
export class ExcelService {
  private readonly logger = new Logger(ExcelService.name);

  constructor(
    @InjectRepository(Genre)
    private genreRepo: Repository<Genre>,
    @InjectRepository(Country)
    private countryRepo: Repository<Country>,
    @InjectRepository(Disc)
    private discRepo: Repository<Disc>,
    @InjectRepository(Artist)
    private artistRepo: Repository<Artist>,
  ) { }

  async generateTemplate(): Promise<Buffer> {
    console.log('Starting generateTemplate...');
    try {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Discos');
      console.log('Worksheet created');

      // Fetch genres and countries from database
      console.log('Fetching genres and countries...');
      const genres = await this.genreRepo.find({ order: { name: 'ASC' } });
      const countries = await this.countryRepo.find({ order: { name: 'ASC' } });
      console.log(`Fetched ${genres.length} genres and ${countries.length} countries`);

      const genreNames = genres.map(g => g.name);
      const countryNames = countries.map(c => c.name);
      const yesNo = ['Si', 'No'];

      // Columns
      ws.columns = [
        { header: 'Fecha', key: 'fecha', width: 15 },
        { header: 'Artista', key: 'artista', width: 25 },
        { header: 'Disco', key: 'disco', width: 25 },
        { header: 'Género', key: 'genero', width: 20 },
        { header: 'País', key: 'pais', width: 20 },
        { header: 'Debut', key: 'debut', width: 10 },
        { header: 'EP', key: 'ep', width: 10 },
      ];
      console.log('Columns set');

      // Add data validation (dropdowns) for rows 2 to 101
      for (let i = 2; i <= 101; i++) {
        // Género dropdown
        ws.getCell(`D${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${genreNames.join(',')}"`],
        };
        // País dropdown
        ws.getCell(`E${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${countryNames.join(',')}"`],
        };
        // Debut dropdown
        ws.getCell(`F${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${yesNo.join(',')}"`],
        };
        // EP dropdown
        ws.getCell(`G${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${yesNo.join(',')}"`],
        };
      }
      console.log('Data validation added');

      console.log('Writing buffer...');
      const buffer = await workbook.xlsx.writeBuffer();
      console.log('Buffer written, type:', buffer?.constructor?.name);

      // writeBuffer in newer exceljs versions returns Promise<Buffer>, but treating as such or converting is safe
      return Buffer.from(buffer);
    } catch (error) {
      console.error('Error in generateTemplate:', error);
      throw error;
    }
  }

  async importDiscs(fileBuffer: Buffer): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS sometimes fails to read a raw multer Buffer directly through load()
    // It is safer to convert the buffer to a stream or provide an ArrayBuffer
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);

    await workbook.xlsx.read(bufferStream);

    if (workbook.worksheets.length === 0) {
      throw new Error('El archivo Excel está vacío o no tiene hojas legibles');
    }

    // Pre-load all genres and countries for fast lookup
    const genres = await this.genreRepo.find();
    const countries = await this.countryRepo.find();
    const genreMap = new Map(genres.map(g => [g.name.toLowerCase(), g]));
    const countryMap = new Map(countries.map(c => [c.name.toLowerCase(), c]));

    const errors: ImportResult['errors'] = [];
    let created = 0;

    for (const ws of workbook.worksheets) {
      this.logger.log(`Procesando hoja: ${ws.name}`);
      // Collect row data (eachRow is synchronous, but we need async DB calls)
      const rowsData: { rowNumber: number; values: any }[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        rowsData.push({ rowNumber, values: row.values });
      });

      for (const { rowNumber, values } of rowsData) {
        // ExcelJS row.values is 1-indexed: [undefined, col1, col2, ...]
        const fechaRaw = values[1];
        const artistaName = values[2] ? String(values[2]).trim() : '';
        const discoName = values[3] ? String(values[3]).trim() : '';
        const generoName = values[4] ? String(values[4]).trim() : '';
        const paisName = values[5] ? String(values[5]).trim() : '';
        const debutRaw = values[6] ? String(values[6]).trim() : '';
        const epRaw = values[7] ? String(values[7]).trim() : '';

        // Skip completely empty rows
        if (!artistaName && !discoName) continue;

        try {
          // Validate required fields
          if (!artistaName) {
            errors.push({ row: rowNumber, disc: discoName, artist: artistaName, error: `[Hoja: ${ws.name}] El campo "Artista" es obligatorio` });
            continue;
          }
          if (!discoName) {
            errors.push({ row: rowNumber, disc: discoName, artist: artistaName, error: `[Hoja: ${ws.name}] El campo "Disco" es obligatorio` });
            continue;
          }

          // Parse release date
          let releaseDate: Date | null = null;
          if (fechaRaw) {
            if (fechaRaw instanceof Date) {
              releaseDate = fechaRaw;
            } else {
              const dateStr = String(fechaRaw).trim();
              // Match DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
              const match = dateStr.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
              if (match) {
                const day = parseInt(match[1], 10);
                const month = parseInt(match[2], 10) - 1;
                const year = parseInt(match[3], 10);
                releaseDate = new Date(Date.UTC(year, month, day));
              } else {
                const parsed = new Date(dateStr);
                if (!isNaN(parsed.getTime())) {
                  releaseDate = parsed;
                }
              }
            }
          }

          // Resolve genre
          let genre: Genre | undefined;
          if (generoName) {
            genre = genreMap.get(generoName.toLowerCase());
            if (!genre) {
              errors.push({ row: rowNumber, disc: discoName, artist: artistaName, error: `[Hoja: ${ws.name}] Género "${generoName}" no encontrado en la base de datos` });
              continue;
            }
          }

          // Resolve country
          let country: Country | undefined;
          if (paisName) {
            country = countryMap.get(paisName.toLowerCase());
            if (!country) {
              errors.push({ row: rowNumber, disc: discoName, artist: artistaName, error: `[Hoja: ${ws.name}] País "${paisName}" no encontrado en la base de datos` });
              continue;
            }
          }

          // Resolve or create artist
          let artist = await this.artistRepo.findOne({
            where: {
              name: artistaName,
              ...(country ? { countryId: country.id } : {}),
            },
          });

          if (!artist) {
            artist = this.artistRepo.create({
              name: artistaName,
              nameNormalized: artistaName.toLowerCase(),
              ...(country ? { countryId: country.id } : {}),
            });
            await this.artistRepo.save(artist);
            this.logger.log(`Artista creado: "${artistaName}" (Hoja: ${ws.name}, fila ${rowNumber})`);
          }

          // Check for duplicate disc
          const existingDisc = await this.discRepo.findOne({
            where: {
              name: discoName,
              artist: { id: artist.id },
              ...(releaseDate ? { releaseDate } : {}),
            },
          });

          if (existingDisc) {
            errors.push({ row: rowNumber, disc: discoName, artist: artistaName, error: `[Hoja: ${ws.name}] El disco ya existe en la base de datos` });
            continue;
          }

          // Parse boolean fields (empty defaults to false / "No")
          const debut = debutRaw ? debutRaw.toLowerCase() === 'si' : false;
          const ep = epRaw ? epRaw.toLowerCase() === 'si' : false;

          // Create disc
          const disc = this.discRepo.create({
            name: discoName,
            releaseDate,
            debut,
            ep,
            artist,
            ...(genre ? { genre } : {}),
          });

          await this.discRepo.save(disc);
          created++;
          this.logger.log(`Disco creado: "${discoName}" - "${artistaName}" (Hoja: ${ws.name}, fila ${rowNumber})`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ row: rowNumber, disc: discoName, artist: artistaName, error: `[Hoja: ${ws.name}] ` + message });
          this.logger.error(`Error en fila ${rowNumber} (Hoja: ${ws.name}): ${message}`);
        }
      }
    }

    this.logger.log(`Importación finalizada: ${created} discos creados, ${errors.length} errores`);
    return { created, errors };
  }
}

