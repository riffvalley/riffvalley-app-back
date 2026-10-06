import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as request from 'supertest';
import { Artist } from '../src/catalog/artists/entities/artist.entity';
import { CatalogImportModule } from '../src/catalog/import/catalog-import.module';
import { Country } from '../src/catalog/countries/entities/country.entity';
import { Disc } from '../src/catalog/discs/entities/disc.entity';
import { Genre } from '../src/catalog/genres/entities/genre.entity';
import { Rate } from '../src/community/rates/entities/rate.entity';
import { UserAccessLog } from '../src/auth/entities/user-access-log.entity';
import { User } from '../src/auth/entities/user.entity';
import { ValidRoles } from '../src/auth/interfaces/valid-roles';

interface TestUser {
  id: string;
  username: string;
  isActive: boolean;
  roles: string[];
}

describe('Excel import (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let validRoleToken: string;
  let invalidRoleToken: string;
  const testUsers = new Map<string, TestUser>();

  beforeAll(async () => {
    jest
      .spyOn(fs, 'createWriteStream')
      .mockReturnValue({ write: jest.fn() } as unknown as fs.WriteStream);

    const userRepository = {
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(testUsers.get(id) ?? null),
      ),
      findOne: jest.fn(({ where }: { where: { id: string } }) => {
        const user = testUsers.get(where.id);
        return Promise.resolve(user ? { roles: user.roles } : null);
      }),
    };
    const genreRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'genre-1', name: 'Rock' }]),
    };
    const countryRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'country-1', name: 'Spain' }]),
    };

    const testingModule = Test.createTestingModule({
      imports: [CatalogImportModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn(() => 'excel-e2e-test-secret') })
      .overrideProvider(getRepositoryToken(Artist))
      .useValue({})
      .overrideProvider(getRepositoryToken(Disc))
      .useValue({})
      .overrideProvider(getRepositoryToken(Country))
      .useValue(countryRepository)
      .overrideProvider(getRepositoryToken(Genre))
      .useValue(genreRepository)
      .overrideProvider(getRepositoryToken(User))
      .useValue(userRepository)
      .overrideProvider(getRepositoryToken(UserAccessLog))
      .useValue({})
      .overrideProvider(getRepositoryToken(Rate))
      .useValue({});

    moduleRef = await testingModule.compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const jwtService = moduleRef.get(JwtService);
    const createToken = (username: string, roles: string[]): string => {
      const user: TestUser = {
        id: randomUUID(),
        username,
        isActive: true,
        roles,
      };
      testUsers.set(user.id, user);
      return jwtService.sign({ id: user.id, username, roles });
    };

    validRoleToken = createToken('excel-e2e-riff-valley', [ValidRoles.riffValley]);
    invalidRoleToken = createToken('excel-e2e-user', [ValidRoles.user]);
  });

  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  it('rejects a template request without authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/catalog/import/excel/template')
      .expect(401);
  });

  it('rejects an authenticated template request without an allowed role', async () => {
    await request(app.getHttpServer())
      .get('/api/catalog/import/excel/template')
      .set('Authorization', `Bearer ${invalidRoleToken}`)
      .expect(403);
  });

  it('downloads the template for an authenticated user with an allowed role', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/catalog/import/excel/template')
      .set('Authorization', `Bearer ${validRoleToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .expect(
        'Content-Disposition',
        'attachment; filename="template_discos.xlsx"',
      );

    expect(response.body).toBeInstanceOf(Buffer);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('imports an authenticated Excel upload from the current multipart route', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Discos').addRow([
      'Fecha',
      'Artista',
      'Disco',
      'Género',
      'País',
      'Debut',
      'EP',
    ]);
    const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await request(app.getHttpServer())
      .post('/api/catalog/import/excel')
      .set('Authorization', `Bearer ${validRoleToken}`)
      .attach('file', fileBuffer, {
        filename: 'albums.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201)
      .expect({ created: 0, errors: [] });
  });
});
