import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { HttpStatus } from '@nestjs/common';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { CatalogImportService } from '../import/catalog-import.service';
import { CatalogImportController } from './catalog-import.controller';

describe('CatalogImportController contract characterization', () => {
  it('keeps the manual catalog import route, POST method, authentication guards, and superadmin role', async () => {
    const service = {
      processManualData: jest.fn().mockResolvedValue({ results: [] }),
    };
    const controller = new CatalogImportController(
      service as unknown as CatalogImportService,
    );
    const dto = { date: 'October 4, 2026', albums: [] } as any;
    const routeHandler = CatalogImportController.prototype.processManualData;
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      CatalogImportController,
    );

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
      guards.some((guard: Function) => guard.name === 'UserRoleGuard'),
    ).toBe(true);

    await expect(controller.processManualData(dto)).resolves.toEqual({
      message: 'Data processed successfully',
      data: { results: [] },
    });
    expect(service.processManualData).toHaveBeenCalledWith(dto);
    expect(service.processManualData).toHaveBeenCalledTimes(1);
  });
});
