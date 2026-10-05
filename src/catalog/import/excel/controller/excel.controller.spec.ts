import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  RequestMethod,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Response } from 'express';
import { META_ROLES } from 'src/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { of } from 'rxjs';
import { ExcelImportService } from '../import/excel-import.service';
import { ExcelTemplateService } from '../template/excel-template.service';
import { ExcelController } from './excel.controller';

const mockMulterSingle = jest.fn(
  (_fieldName: string) =>
    (
      _request: unknown,
      _response: unknown,
      callback: (error?: Error) => void,
    ) =>
      callback(),
);

jest.mock('multer', () =>
  jest.fn(() => ({
    single: (fieldName: string) => mockMulterSingle(fieldName),
  })),
);

describe('ExcelController contract characterization', () => {
  let controller: ExcelController;
  let excelService: { importDiscs: jest.Mock };
  let excelTemplateService: { generateTemplate: jest.Mock };

  beforeEach(() => {
    jest.restoreAllMocks();
    mockMulterSingle.mockClear();
    excelService = { importDiscs: jest.fn() };
    excelTemplateService = { generateTemplate: jest.fn() };
    controller = new ExcelController(
      excelService as unknown as ExcelImportService,
      excelTemplateService as unknown as ExcelTemplateService,
    );

    jest.spyOn(controller['logger'], 'log').mockImplementation(() => undefined);
    jest
      .spyOn(controller['logger'], 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('keeps the catalog import Excel routes, verbs, and multipart field file', async () => {
    const downloadHandler = ExcelController.prototype.downloadTemplate;
    const uploadHandler = ExcelController.prototype.uploadTemplate;
    const interceptors = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      uploadHandler,
    ) as Function[];

    expect(Reflect.getMetadata(PATH_METADATA, ExcelController)).toBe(
      'catalog/import/excel',
    );
    expect(Reflect.getMetadata(PATH_METADATA, downloadHandler)).toBe(
      'template',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, downloadHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, uploadHandler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, uploadHandler)).toBe(
      RequestMethod.POST,
    );
    expect(interceptors).toHaveLength(1);

    const request = {};
    const response = {};
    const next = { handle: jest.fn(() => of('next')) };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    };
    const uploadInterceptor = new (interceptors[0] as new () => {
      intercept: (context: ExecutionContext, next: CallHandler) => unknown;
    })();

    await uploadInterceptor.intercept(
      context as ExecutionContext,
      next as CallHandler,
    );

    expect(mockMulterSingle).toHaveBeenCalledWith('file');
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('protects both routes with the same authentication and role policy', () => {
    const handlers = [
      ExcelController.prototype.downloadTemplate,
      ExcelController.prototype.uploadTemplate,
    ];
    const allowedRoles = [
      ValidRoles.riffValley,
      ValidRoles.admin,
      ValidRoles.superUser,
    ];

    for (const handler of handlers) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as Function[];

      expect(Reflect.getMetadata(META_ROLES, handler)).toEqual(allowedRoles);
      expect(guards).toHaveLength(2);
      expect(guards).toContain(UserRoleGuard);
      expect(guards.some((guard) => typeof guard.prototype?.canActivate === 'function')).toBe(true);
    }
  });

  it('delegates template generation and sends its buffer with the current download headers', async () => {
    const buffer = Buffer.from('xlsx-template');
    excelTemplateService.generateTemplate.mockResolvedValue(buffer);
    const response = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    await controller.downloadTemplate(response as unknown as Response);

    expect(excelTemplateService.generateTemplate).toHaveBeenCalledTimes(1);
    expect(response.set).toHaveBeenCalledWith({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_discos.xlsx"',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    expect(response.send).toHaveBeenCalledWith(buffer);
    expect(response.status).not.toHaveBeenCalled();
    expect(excelService.importDiscs).not.toHaveBeenCalled();
  });

  it('returns status 500 and the current error text when template generation fails', async () => {
    excelTemplateService.generateTemplate.mockRejectedValue(
      new Error('workbook failed'),
    );
    const response = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    await controller.downloadTemplate(response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith(
      'Error generating Excel file: workbook failed',
    );
    expect(response.set).not.toHaveBeenCalled();
  });

  it('delegates the uploaded buffer and returns the import result unchanged', async () => {
    const file = {
      originalname: 'albums.xlsx',
      size: 12,
      buffer: Buffer.from('uploaded-xlsx'),
    } as Express.Multer.File;
    const result = {
      created: 2,
      errors: [{ row: 4, disc: 'Album', artist: 'Artist', error: 'invalid' }],
    };
    excelService.importDiscs.mockResolvedValue(result);

    await expect(controller.uploadTemplate(file)).resolves.toBe(result);
    expect(excelService.importDiscs).toHaveBeenCalledWith(file.buffer);
    expect(excelService.importDiscs).toHaveBeenCalledTimes(1);
    expect(excelTemplateService.generateTemplate).not.toHaveBeenCalled();
  });

  it('rejects a missing upload with the current Bad Request response', async () => {
    const error = await controller
      .uploadTemplate(undefined as never)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).getResponse()).toEqual({
      statusCode: 400,
      message: 'No se ha proporcionado ningún archivo',
      error: 'Bad Request',
    });
    expect(excelService.importDiscs).not.toHaveBeenCalled();
  });

  it('propagates an import service error unchanged', async () => {
    const file = {
      originalname: 'albums.xlsx',
      size: 12,
      buffer: Buffer.from('uploaded-xlsx'),
    } as Express.Multer.File;
    const error = new Error('import failed');
    excelService.importDiscs.mockRejectedValue(error);

    await expect(controller.uploadTemplate(file)).rejects.toBe(error);
    expect(excelService.importDiscs).toHaveBeenCalledWith(file.buffer);
  });
});
