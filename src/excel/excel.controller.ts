import { Controller, Get, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ExcelService } from './excel.service';

@Controller('excel')
export class ExcelController {
  private readonly logger = new Logger(ExcelController.name);
  constructor(private readonly excelService: ExcelService) { }

  @Get('template/download')
  async downloadTemplate(@Res() res: Response) {
    this.logger.log('Received request for Excel template download');
    try {
      const buffer = await this.excelService.generateTemplate();
      this.logger.log(`Excel template generated, size: ${buffer.length} bytes`);
      this.logger.log(`Buffer type: ${buffer.constructor.name}`);

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="template_discos.xlsx"',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      console.log('enviando respuesta');
      res.send(buffer);
      this.logger.log('Response sent');
    } catch (error) {
      this.logger.error('Error generating or sending Excel file', error);
      console.error('Error in downloadTemplate:', error);
      res.status(500).send('Error generating Excel file: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}
