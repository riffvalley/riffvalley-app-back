import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';

import { ProcessManualDataDto } from '../dto/process-manual-data.dto';
import { parseManualAlbumLine } from '../parser/parse-manual-album-line';
import { parseManualDate } from '../parser/parse-manual-date';
import { normalizeImportArtistName } from '../parser/normalize-import-artist-name';
import { ManualImportLogger } from '../logging/manual-import-logger';
import { Artist } from '../../../artists/entities/artist.entity';
import { Disc } from '../../../discs/entities/disc.entity';
import { Country } from '../../../countries/entities/country.entity';
import { Genre } from '../../../genres/entities/genre.entity';

export interface ProcessedDiscEntry {
  discId: string;
  artistId: string;
  message: string;
}

@Injectable()
export class CatalogImportService {
  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,

    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,

    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,

    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
    private readonly manualImportLogger: ManualImportLogger,
  ) {}

  async processManualData(
    dto: ProcessManualDataDto,
  ): Promise<{ savedDiscs: ProcessedDiscEntry[]; existingDiscs: ProcessedDiscEntry[] }> {
    const { date, albums } = dto;
    this.manualImportLogger.log(`Processing manual data for date: ${date}`);

    let releaseDate: Date | null;
    try {
      releaseDate = parseManualDate(date);
    } catch (error) {
      this.manualImportLogger.log(`Error parsing date: ${date} - ${error}`);
      releaseDate = null;
    }

    if (!releaseDate) {
      this.manualImportLogger.log(`Invalid date provided: ${date}`);
      throw new Error(`Invalid date: ${date}`);
    }

    const defaultCountry = await this.countryRepository.findOne({
      where: { name: 'Sin pais' },
    });

    // Arrays para acumular el reporte
    const report = {
      savedDiscs: [] as ProcessedDiscEntry[],
      existingDiscs: [] as ProcessedDiscEntry[],
    };

    for (const album of albums) {
      const { line: albumLine, genreId, countryId, ep = false, debut = false } = album;

      const parsedLine = parseManualAlbumLine(albumLine);
      if (parsedLine.kind === 're-release') {
        this.manualImportLogger.log(`Skipping album (Re-Release): ${albumLine}`);
        continue;
      }

      if (parsedLine.kind === 'invalid') {
        this.manualImportLogger.log(`Unexpected format: ${albumLine}`);
        continue;
      }

      const { artistName, discName } = parsedLine;

      const [genre, country] = await Promise.all([
        genreId ? this.genreRepository.findOne({ where: { id: genreId } }) : Promise.resolve(null),
        countryId ? this.countryRepository.findOne({ where: { id: countryId } }) : Promise.resolve(null),
      ]);

      if (genreId && !genre) {
        this.manualImportLogger.log(`Genre ${genreId} not found for album: ${albumLine}`);
        throw new NotFoundException(`Genre ${genreId} not found`);
      }
      if (countryId && !country) {
        this.manualImportLogger.log(`Country ${countryId} not found for album: ${albumLine}`);
        throw new NotFoundException(`Country ${countryId} not found`);
      }

      // Búsqueda del artista de forma insensible a mayúsculas/minúsculas
      let artist = await this.artistRepository.findOne({
        where: { name: ILike(artistName.trim()) },
      });

      if (!artist) {
        // --- ÚNICO CAMBIO: setear nameNormalized al crear el artista ---
        artist = this.artistRepository.create({
          name: artistName,
          nameNormalized: normalizeImportArtistName(artistName),
          description: '',
          image: '',
          country: country ?? defaultCountry ?? undefined,
        } as Partial<Artist>);
        // ---------------------------------------------------------------
        artist = await this.artistRepository.save(artist);
      }

      // Búsqueda del disco de forma insensible a mayúsculas/minúsculas (SIN CAMBIOS)
      let disc = await this.discRepository.findOne({
        where: {
          name: ILike(discName.trim()),
          artist: { id: artist.id },
        },
      });

      if (!disc) {
        disc = this.discRepository.create({
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
        disc = await this.discRepository.save(disc);
        this.manualImportLogger.log(
          `Processed: Artist "${artistName}" => Disc "${discName}" => Date: ${releaseDate}`,
        );
        report.savedDiscs.push({
          discId: disc.id,
          artistId: artist.id,
          message: `Artist "${artistName}" => Disc "${discName}" => Date: ${releaseDate}`,
        });
      } else {
        this.manualImportLogger.log(
          `Already exists: Artist "${artistName}" => Disc "${discName}"`,
        );
        report.existingDiscs.push({
          discId: disc.id,
          artistId: artist.id,
          message: `Artist "${artistName}" => Disc "${discName}"`,
        });
      }
    }

    return report;
  }
}
