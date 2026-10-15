import {
  Controller,
  Get,
  Post,
  Res,
  Logger,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { ExcelImportService } from '../import/excel-import.service';
import { ExcelTemplateService } from '../template/excel-template.service';
import { InvalidExcelWorkbookError } from '../parser/excel-workbook.parser';

@Controller('catalog/import/excel')
export class ExcelController {
  private readonly logger = new Logger(ExcelController.name);
  constructor(
    private readonly excelService: ExcelImportService,
    private readonly excelTemplateService: ExcelTemplateService,
  ) {}

  @Get('template')
  @Auth(ValidRoles.riffvalley)
  async downloadTemplate(@Res() res: Response) {
    this.logger.log('Received request for Excel template download');
    try {
      const buffer = await this.excelTemplateService.generateTemplate();
      this.logger.log(`Excel template generated, size: ${buffer.length} bytes`);
      this.logger.log(`Buffer type: ${buffer.constructor.name}`);

      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="template_discos.xlsx"',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });
      console.log('enviando respuesta');
      res.send(buffer);
      this.logger.log('Response sent');
    } catch (error) {
      this.logger.error('Error generating or sending Excel file', error);
      console.error('Error in downloadTemplate:', error);
      res
        .status(500)
        .send(
          'Error generating Excel file: ' +
            (error instanceof Error ? error.message : String(error)),
        );
    }
  }

  @Post()
  @Auth(ValidRoles.riffvalley)
  @UseInterceptors(FileInterceptor('file'))
  async uploadTemplate(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException(
        'El archivo no contiene un workbook Excel válido.',
      );
    }

    this.logger.log(
      `Archivo recibido: ${file.originalname} (${file.size} bytes)`,
    );

    const result = await this.excelService
      .importDiscs(file.buffer)
      .catch((error: unknown) => {
        if (error instanceof InvalidExcelWorkbookError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      });
    const counts = result.results.reduce(
      (totals, item) => {
        totals[item.status] += 1;
        return totals;
      },
      { imported: 0, duplicate: 0, failed: 0 },
    );

    this.logger.log(
      `Importación completada: ${counts.imported} importados, ${counts.duplicate} duplicados, ${counts.failed} fallidos`,
    );

    return { data: result };
  }
}
