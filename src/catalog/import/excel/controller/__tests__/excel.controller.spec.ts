import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  InternalServerErrorException,
  RequestMethod,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { of } from 'rxjs';
import { ExcelImportService } from '../../import/excel-import.service';
import { InvalidExcelWorkbookError } from '../../parser/excel-workbook.parser';
import { ExcelTemplateService } from '../../template/excel-template.service';
import { ExcelController } from '../excel.controller';

const mockMulterSingle = jest.fn((fieldName: string) => {
  void fieldName;
  return (
    _request: unknown,
    _response: unknown,
    callback: (error?: Error) => void,
  ) => callback();
});

jest.mock('multer', () =>
  jest.fn(() => ({
    single: (fieldName: string) => mockMulterSingle(fieldName),
  })),
);

type UploadInterceptor = {
  intercept: (context: ExecutionContext, next: CallHandler) => unknown;
};

type UploadInterceptorConstructor = new () => UploadInterceptor;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUploadInterceptorConstructor(
  value: unknown,
): value is UploadInterceptorConstructor {
  if (typeof value !== 'function') return false;
  const prototype: unknown = value.prototype;
  return isRecord(prototype) && typeof prototype.intercept === 'function';
}

function hasCanActivate(value: unknown): boolean {
  if (typeof value !== 'function') return false;
  const prototype: unknown = value.prototype;
  return isRecord(prototype) && typeof prototype.canActivate === 'function';
}

describe('ExcelController contract characterization', () => {
  let controller: ExcelController;
  let excelService: { importDiscs: jest.Mock };
  let excelTemplateService: { generateTemplate: jest.Mock };

  beforeEach(() => {
    jest.restoreAllMocks();
    mockMulterSingle.mockClear();
    excelService = { importDiscs: jest.fn() };
    excelTemplateService = { generateTemplate: jest.fn() };
    return Test.createTestingModule({
      controllers: [ExcelController],
      providers: [
        { provide: ExcelImportService, useValue: excelService },
        { provide: ExcelTemplateService, useValue: excelTemplateService },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile()
      .then((moduleRef) => {
        controller = moduleRef.get(ExcelController);
      });

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
    const interceptorMetadata: unknown = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      uploadHandler,
    );
    const interceptors = Array.isArray(interceptorMetadata)
      ? interceptorMetadata.filter(isUploadInterceptorConstructor)
      : [];

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
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, uploadHandler),
    ).toBeUndefined();
    expect(interceptors).toHaveLength(1);

    const request = {};
    const response = {};
    const next = { handle: jest.fn(() => of('next')) };
    const context = new ExecutionContextHost([request, response]);
    const [UploadInterceptorClass] = interceptors;
    if (!UploadInterceptorClass) {
      throw new Error('Expected a multipart upload interceptor.');
    }
    const uploadInterceptor = new UploadInterceptorClass();

    await uploadInterceptor.intercept(context, next as CallHandler);

    expect(mockMulterSingle).toHaveBeenCalledWith('file');
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('protects both routes with the same authentication and role policy', () => {
    const handlers = [
      ExcelController.prototype.downloadTemplate,
      ExcelController.prototype.uploadTemplate,
    ];
    for (const handler of handlers) {
      const guardMetadata: unknown = Reflect.getMetadata(
        GUARDS_METADATA,
        handler,
      );
      const guards = Array.isArray(guardMetadata) ? guardMetadata : [];

      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
        ValidRoles.riffvalley,
      );
      expect(guards).toHaveLength(2);
      expect(guards).toContain(UserRoleGuard);
      expect(guards.some(hasCanActivate)).toBe(true);
    }
  });

  it('allows a persisted superadmin through the riffvalley minimum on both routes', async () => {
    const repository = {
      findIdentityById: jest.fn().mockResolvedValue({
        role: ValidRoles.superadmin,
        isActive: true,
      }),
    };
    const guard = new UserRoleGuard(new Reflector(), repository as never);

    for (const handler of [
      ExcelController.prototype.downloadTemplate,
      ExcelController.prototype.uploadTemplate,
    ]) {
      await expect(
        guard.canActivate(
          new ExecutionContextHost(
            [{ user: { id: 'user-id', username: 'superadmin' } }],
            ExcelController,
            handler,
          ),
        ),
      ).resolves.toBe(true);
    }
  });

  it('delegates template generation and sends its buffer with the current download headers', async () => {
    const buffer = Buffer.from('xlsx-template');
    excelTemplateService.generateTemplate.mockResolvedValue(buffer);
    const response: Partial<Response> = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    await controller.downloadTemplate(response as Response);

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
    const response: Partial<Response> = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    await controller.downloadTemplate(response as Response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith(
      'Error generating Excel file: workbook failed',
    );
    expect(response.set).not.toHaveBeenCalled();
  });

  it('delegates the uploaded buffer and returns the common data.results contract', async () => {
    const file = {
      originalname: 'albums.xlsx',
      size: 12,
      buffer: Buffer.from('uploaded-xlsx'),
    } as Express.Multer.File;
    const result = {
      results: [
        {
          inputIndex: 0,
          source: { kind: 'excel', sheet: 'Discos', rowNumber: 4 },
          status: 'failed',
          reasonCode: 'INVALID_INPUT',
          artistName: 'Artist',
          discName: 'Album',
          message: 'El campo "Artista" es obligatorio.',
        },
      ],
    };
    excelService.importDiscs.mockResolvedValue(result);

    await expect(controller.uploadTemplate(file)).resolves.toEqual({
      data: result,
    });
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

  it('rejects an empty uploaded file as a Bad Request without invoking the service', async () => {
    const file = {
      originalname: 'empty.xlsx',
      size: 0,
      buffer: Buffer.alloc(0),
    } as Express.Multer.File;
    const error = await controller
      .uploadTemplate(file)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: 'El archivo no contiene un workbook Excel válido.',
    });
    expect(excelService.importDiscs).not.toHaveBeenCalled();
  });

  it('maps a recognized invalid workbook to a safe Bad Request response', async () => {
    const file = {
      originalname: 'corrupt.xlsx',
      size: 12,
      buffer: Buffer.from('PK\u0003\u0004corrupt'),
    } as Express.Multer.File;
    excelService.importDiscs.mockRejectedValue(new InvalidExcelWorkbookError());
    const error = await controller
      .uploadTemplate(file)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: 'El archivo no contiene un workbook Excel válido.',
    });
  });

  it('preserves unexpected import exceptions as server errors', async () => {
    const file = {
      originalname: 'albums.xlsx',
      size: 12,
      buffer: Buffer.from('uploaded-xlsx'),
    } as Express.Multer.File;
    const error = new InternalServerErrorException('Unexpected parser failure');
    excelService.importDiscs.mockRejectedValue(error);

    await expect(controller.uploadTemplate(file)).rejects.toBe(error);
    expect(error.getStatus()).toBe(500);
    expect(error).not.toBeInstanceOf(BadRequestException);
    expect(excelService.importDiscs).toHaveBeenCalledWith(file.buffer);
  });
});
