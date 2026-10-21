import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { CatalogImportService } from '../../import/catalog-import.service';
import { ProcessManualDataDto } from '../../dto/process-manual-data.dto';
import { CatalogImportController } from '../catalog-import.controller';

describe('CatalogImportController contract characterization', () => {
  it('keeps the manual catalog import route, POST method, authentication guards, and superadmin role', async () => {
    const service = {
      processManualData: jest.fn().mockResolvedValue({ results: [] }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogImportController],
      providers: [{ provide: CatalogImportService, useValue: service }],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();
    const controller = moduleRef.get(CatalogImportController);
    const dto: ProcessManualDataDto = {
      date: 'October 4, 2026',
      albums: [],
    };
    const routeHandler = CatalogImportController.prototype.processManualData;
    const guardMetadata: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      CatalogImportController,
    );
    const guards = Array.isArray(guardMetadata) ? guardMetadata : [];

    expect(Reflect.getMetadata(PATH_METADATA, CatalogImportController)).toBe(
      'catalog/import',
    );
    expect(Reflect.getMetadata(PATH_METADATA, routeHandler)).toBe('manual');
    expect(Reflect.getMetadata(METHOD_METADATA, routeHandler)).toBe(1);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, routeHandler)).toBe(
      HttpStatus.CREATED,
    );
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, CatalogImportController),
    ).toBe(ValidRoles.superadmin);
    expect(guards).toHaveLength(2);
    expect(
      guards.some(
        (guard: unknown) =>
          typeof guard === 'function' && guard.name === 'UserRoleGuard',
      ),
    ).toBe(true);

    await expect(controller.processManualData(dto)).resolves.toEqual({
      message: 'Data processed successfully',
      data: { results: [] },
    });
    expect(service.processManualData).toHaveBeenCalledWith(dto);
    expect(service.processManualData).toHaveBeenCalledTimes(1);
    await moduleRef.close();
  });
});
