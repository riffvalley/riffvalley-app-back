import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';

import { ProcessManualDataDto } from './dto/process-manual-data.dto';
import { Artist } from 'src/artists/entities/artist.entity';
import { Disc } from 'src/discs/entities/disc.entity';
import { Country } from 'src/countries/entities/country.entity';
import { Genre } from 'src/genres/entities/genre.entity';

@Injectable()
export class ScrapingService {
  private logStream: fs.WriteStream;

  constructor(
    @InjectRepository(Artist)
    private readonly artistRepository: Repository<Artist>,

    @InjectRepository(Disc)
    private readonly discRepository: Repository<Disc>,

    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,

    @InjectRepository(Genre)
    private readonly genreRepository: Repository<Genre>,
  ) {
    this.logStream = fs.createWriteStream('manual_data.log', { flags: 'a' });
  }

  // --- SOLO añadido para normalizar el nombre del artista ---
  private normalize(str: string): string {
    return (str ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
  // ----------------------------------------------------------

  private log(message: string) {
    try {
      const timestamp = new Date().toISOString();
      this.logStream.write(`[${timestamp}] ${message}\n`);
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  async processManualData(
    dto: ProcessManualDataDto,
  ): Promise<{ savedDiscs: string[]; existingDiscs: string[] }> {
    const { date, albums } = dto;
    this.log(`Processing manual data for date: ${date}`);

    const releaseDate = this.parseDateString(date);
    if (!releaseDate) {
      this.log(`Invalid date provided: ${date}`);
      throw new Error(`Invalid date: ${date}`);
    }

    const defaultCountry = await this.countryRepository.findOne({
      where: { name: 'Sin pais' },
    });

    // Arrays para acumular el reporte
    const report = {
      savedDiscs: [] as string[],
      existingDiscs: [] as string[],
    };

    for (const album of albums) {
      const { line: albumLine, genreId, countryId, ep = false, debut = false } = album;

      if (albumLine.toLowerCase().includes('re-release')) {
        this.log(`Skipping album (Re-Release): ${albumLine}`);
        continue;
      }

      // Normalizamos la línea, reemplazando " - " por " – " (guion largo)
      const normalizedAlbumLine = albumLine.replace(' - ', ' – ');
      const [artistName, discInfo] = normalizedAlbumLine.split(' – ');
      if (!artistName || !discInfo) {
        this.log(`Unexpected format: ${albumLine}`);
        continue;
      }

      let discName = discInfo.trim();
      const match = discName.match(/\(([^)]+)\)$/);
      if (match) {
        discName = discName.replace(`(${match[1]})`, '').trim();
      }

      const [genre, country] = await Promise.all([
        genreId ? this.genreRepository.findOne({ where: { id: genreId } }) : Promise.resolve(null),
        countryId ? this.countryRepository.findOne({ where: { id: countryId } }) : Promise.resolve(null),
      ]);

      if (genreId && !genre) {
        this.log(`Genre ${genreId} not found for album: ${albumLine}`);
        throw new NotFoundException(`Genre ${genreId} not found`);
      }
      if (countryId && !country) {
        this.log(`Country ${countryId} not found for album: ${albumLine}`);
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
          nameNormalized: this.normalize(artistName),
          description: '',
          image: '',
          country: defaultCountry ?? undefined,
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
          ...(country && { country }),
          ep,
          debut,
          releaseDate: releaseDate ?? null,
        });
        disc = await this.discRepository.save(disc);
        this.log(
          `Processed: Artist "${artistName}" => Disc "${discName}" => Date: ${releaseDate}`,
        );
        report.savedDiscs.push(
          `Artist "${artistName}" => Disc "${discName}" => Date: ${releaseDate}`,
        );
      } else {
        this.log(
          `Already exists: Artist "${artistName}" => Disc "${discName}"`,
        );
        report.existingDiscs.push(
          `Artist "${artistName}" => Disc "${discName}"`,
        );
      }
    }

    return report;
  }

  private parseDateString(dateStr: string): Date | null {
    try {
      const [monthName, dayWithComma, yearString] = dateStr.split(' ');
      const day = parseInt(dayWithComma.replace(',', ''), 10);
      const year = parseInt(yearString, 10);

      const months = {
        january: 0,
        february: 1,
        march: 2,
        april: 3,
        may: 4,
        june: 5,
        july: 6,
        august: 7,
        september: 8,
        october: 9,
        november: 10,
        december: 11,
      } as Record<string, number>;

      const monthIndex = months[monthName.toLowerCase()];
      if (monthIndex === undefined) {
        return null;
      }

      return new Date(year, monthIndex, day);
    } catch (error) {
      this.log(`Error parsing date: ${dateStr} - ${error}`);
      return null;
    }
  }
}
