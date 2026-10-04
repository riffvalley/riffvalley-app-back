import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { Country } from '../../../../countries/entities/country.entity';
import { Genre } from '../../../../genres/entities/genre.entity';
import { ExcelTemplateService } from './excel-template.service';

describe('ExcelTemplateService', () => {
  let service: ExcelTemplateService;
  let genreRepo: { find: jest.Mock };
  let countryRepo: { find: jest.Mock };

  const rock = { id: 'genre-rock', name: 'Rock' } as Genre;
  const pop = { id: 'genre-pop', name: 'Pop' } as Genre;
  const spain = { id: 'country-es', name: 'Spain' } as Country;
  const usa = { id: 'country-us', name: 'USA' } as Country;

  beforeEach(async () => {
    jest.restoreAllMocks();
    genreRepo = { find: jest.fn().mockResolvedValue([rock, pop]) };
    countryRepo = { find: jest.fn().mockResolvedValue([spain, usa]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExcelTemplateService,
        { provide: getRepositoryToken(Genre), useValue: genreRepo },
        { provide: getRepositoryToken(Country), useValue: countryRepo },
      ],
    }).compile();

    service = module.get<ExcelTemplateService>(ExcelTemplateService);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('generates the current two-sheet workbook, seven columns, catalogue lists, and validations for rows 2–101', async () => {
    genreRepo.find.mockResolvedValue([rock, pop]);
    countryRepo.find.mockResolvedValue([usa, spain]);

    const result = await service.generateTemplate();

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(genreRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    expect(countryRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result as any);

    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      'Discos',
      'Listas',
    ]);
    const worksheet = workbook.getWorksheet('Discos');
    const listsWorksheet = workbook.getWorksheet('Listas');
    expect(worksheet).toBeDefined();
    expect(listsWorksheet).toBeDefined();
    expect(listsWorksheet!.state).toBe('hidden');
    expect(Array.from(worksheet!.getRow(1).values as any[]).slice(1)).toEqual([
      'Fecha',
      'Artista',
      'Disco',
      'Género',
      'País',
      'Debut',
      'EP',
    ]);
    expect(worksheet!.columnCount).toBe(7);
    expect(worksheet!.getCell('H1').value).toBeNull();

    expect(listsWorksheet!.getCell('A1').value).toBe('Rock');
    expect(listsWorksheet!.getCell('A2').value).toBe('Pop');
    expect(listsWorksheet!.getCell('B1').value).toBe('USA');
    expect(listsWorksheet!.getCell('B2').value).toBe('Spain');
    expect(listsWorksheet!.getCell('C1').value).toBe('Si');
    expect(listsWorksheet!.getCell('C2').value).toBe('No');

    for (const rowNumber of [2, 50, 101]) {
      expect(worksheet!.getCell(`D${rowNumber}`).dataValidation).toEqual({
        type: 'list',
        allowBlank: true,
        formulae: ['Listas!$A$1:$A$2'],
      });
      expect(worksheet!.getCell(`E${rowNumber}`).dataValidation).toEqual({
        type: 'list',
        allowBlank: true,
        formulae: ['Listas!$B$1:$B$2'],
      });
      expect(worksheet!.getCell(`F${rowNumber}`).dataValidation).toEqual({
        type: 'list',
        allowBlank: true,
        formulae: ['Listas!$C$1:$C$2'],
      });
      expect(worksheet!.getCell(`G${rowNumber}`).dataValidation).toEqual({
        type: 'list',
        allowBlank: true,
        formulae: ['Listas!$C$1:$C$2'],
      });
    }
    expect(worksheet!.getCell('D102').dataValidation).toBeUndefined();
    expect(worksheet!.getCell('H2').dataValidation).toBeUndefined();
  });

  it('keeps validations when Genre and Country lookup lists are empty', async () => {
    genreRepo.find.mockResolvedValue([]);
    countryRepo.find.mockResolvedValue([]);

    const result = await service.generateTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result as any);

    const worksheet = workbook.getWorksheet('Discos')!;
    const listsWorksheet = workbook.getWorksheet('Listas')!;
    expect(listsWorksheet.getCell('A1').value).toBeNull();
    expect(listsWorksheet.getCell('B1').value).toBeNull();
    expect(listsWorksheet.getCell('C1').value).toBe('Si');
    expect(worksheet.getCell('D2').dataValidation).toEqual({
      type: 'list',
      allowBlank: true,
      formulae: ['Listas!$A$1:$A$0'],
    });
    expect(worksheet.getCell('E2').dataValidation).toEqual({
      type: 'list',
      allowBlank: true,
      formulae: ['Listas!$B$1:$B$0'],
    });
  });
});
