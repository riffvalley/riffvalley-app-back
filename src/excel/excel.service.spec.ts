import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExcelService } from './excel.service';
import { Genre } from '../genres/entities/genre.entity';
import { Country } from '../countries/entities/country.entity';
import * as ExcelJS from 'exceljs';

describe('ExcelService', () => {
  let service: ExcelService;
  let genreRepo: Repository<Genre>;
  let countryRepo: Repository<Country>;

  const mockGenreRepo = {
    find: jest.fn(),
  };

  const mockCountryRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExcelService,
        {
          provide: getRepositoryToken(Genre),
          useValue: mockGenreRepo,
        },
        {
          provide: getRepositoryToken(Country),
          useValue: mockCountryRepo,
        },
      ],
    }).compile();

    service = module.get<ExcelService>(ExcelService);
    genreRepo = module.get<Repository<Genre>>(getRepositoryToken(Genre));
    countryRepo = module.get<Repository<Country>>(getRepositoryToken(Country));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTemplate', () => {
    it('should generate a buffer with Excel template', async () => {
      const mockGenres = [
        { id: '1', name: 'Rock' },
        { id: '2', name: 'Pop' },
      ];
      const mockCountries = [
        { id: '1', name: 'USA' },
        { id: '2', name: 'Canada' },
      ];

      mockGenreRepo.find.mockResolvedValue(mockGenres);
      mockCountryRepo.find.mockResolvedValue(mockCountries);

      const result = await service.generateTemplate();

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);

      // Load the workbook to verify structure
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result as any);

      const worksheet = workbook.getWorksheet(1);
      expect(worksheet).toBeDefined();
      expect(worksheet.name).toBe('Discos');

      // Check headers
      expect(worksheet.getCell('A1').value).toBe('Fecha');
      expect(worksheet.getCell('B1').value).toBe('Artista');
      expect(worksheet.getCell('C1').value).toBe('Disco');
      expect(worksheet.getCell('D1').value).toBe('Año');
      expect(worksheet.getCell('E1').value).toBe('Género');
      expect(worksheet.getCell('F1').value).toBe('País');
      expect(worksheet.getCell('G1').value).toBe('Debut');
      expect(worksheet.getCell('H1').value).toBe('EP');

      // Check data validation for genres (assuming it's set)
      const genreCell = worksheet.getCell('E2');
      expect(genreCell.dataValidation).toBeDefined();
      expect(genreCell.dataValidation.type).toBe('list');
      expect(genreCell.dataValidation.formulae[0]).toContain('Rock,Pop');

      // Similarly for countries and yes/no
      const countryCell = worksheet.getCell('F2');
      expect(countryCell.dataValidation).toBeDefined();
      expect(countryCell.dataValidation.formulae[0]).toContain('USA,Canada');

      const debutCell = worksheet.getCell('G2');
      expect(debutCell.dataValidation).toBeDefined();
      expect(debutCell.dataValidation.formulae[0]).toContain('Si,No');

      const epCell = worksheet.getCell('H2');
      expect(epCell.dataValidation).toBeDefined();
      expect(epCell.dataValidation.formulae[0]).toContain('Si,No');
    });

    it('should handle empty genres and countries', async () => {
      mockGenreRepo.find.mockResolvedValue([]);
      mockCountryRepo.find.mockResolvedValue([]);

      const result = await service.generateTemplate();

      expect(result).toBeInstanceOf(Buffer);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result as any);

      const worksheet = workbook.getWorksheet(1);
      expect(worksheet).toBeDefined();

      // Data validations should still be set but with empty lists or defaults
      const genreCell = worksheet.getCell('E2');
      expect(genreCell.dataValidation).toBeDefined();
      // For empty, it might be empty string
    });
  });
});
