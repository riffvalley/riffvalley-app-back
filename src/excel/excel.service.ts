import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from '../genres/entities/genre.entity';
import { Country } from '../countries/entities/country.entity';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ExcelService {
  constructor(
    @InjectRepository(Genre)
    private genreRepo: Repository<Genre>,
    @InjectRepository(Country)
    private countryRepo: Repository<Country>,
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
        { header: 'Año', key: 'ano', width: 10 },
        { header: 'Género', key: 'genero', width: 20 },
        { header: 'País', key: 'pais', width: 20 },
        { header: 'Debut', key: 'debut', width: 10 },
        { header: 'EP', key: 'ep', width: 10 },
      ];
      console.log('Columns set');

      // Add data validation (dropdowns) for rows 2 to 101
      for (let i = 2; i <= 101; i++) {
        // Género dropdown
        ws.getCell(`E${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${genreNames.join(',')}"`],
        };
        // País dropdown
        ws.getCell(`F${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${countryNames.join(',')}"`],
        };
        // Debut dropdown
        ws.getCell(`G${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${yesNo.join(',')}"`],
        };
        // EP dropdown
        ws.getCell(`H${i}`).dataValidation = {
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
}
