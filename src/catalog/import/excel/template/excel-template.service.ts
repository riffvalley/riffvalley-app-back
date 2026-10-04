import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { Country } from '../../../../countries/entities/country.entity';
import { Genre } from '../../../../genres/entities/genre.entity';

@Injectable()
export class ExcelTemplateService {
  constructor(
    @InjectRepository(Genre)
    private readonly genreRepo: Repository<Genre>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
  ) {}

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
      console.log(
        `Fetched ${genres.length} genres and ${countries.length} countries`,
      );

      const genreNames = genres.map((genre) => genre.name);
      const countryNames = countries.map((country) => country.name);
      const yesNo = ['Si', 'No'];

      // Hidden sheet with dropdown lists to avoid Excel's 255-char inline limit
      const listsWs = workbook.addWorksheet('Listas');
      listsWs.state = 'hidden';

      genreNames.forEach((name, index) => {
        listsWs.getCell(`A${index + 1}`).value = name;
      });
      countryNames.forEach((name, index) => {
        listsWs.getCell(`B${index + 1}`).value = name;
      });
      yesNo.forEach((value, index) => {
        listsWs.getCell(`C${index + 1}`).value = value;
      });

      const genreRange = `Listas!$A$1:$A$${genreNames.length}`;
      const countryRange = `Listas!$B$1:$B$${countryNames.length}`;
      const yesNoRange = `Listas!$C$1:$C$${yesNo.length}`;

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
      for (let row = 2; row <= 101; row++) {
        ws.getCell(`D${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [genreRange],
        };
        ws.getCell(`E${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [countryRange],
        };
        ws.getCell(`F${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [yesNoRange],
        };
        ws.getCell(`G${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [yesNoRange],
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
