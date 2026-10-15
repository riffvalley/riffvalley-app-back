import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CatalogImportService } from '../import/catalog-import.service';
import { Auth } from 'src/identity/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/identity/auth/interfaces/valid-roles';
import { ProcessManualDataDto } from '../dto/process-manual-data.dto';

@Controller('catalog/import')
@Auth(ValidRoles.superadmin)
export class CatalogImportController {
  constructor(private readonly catalogImportService: CatalogImportService) {}

  @Post('manual')
  @HttpCode(HttpStatus.CREATED)
  async processManualData(@Body() dto: ProcessManualDataDto) {
    const data = await this.catalogImportService.processManualData(dto);
    return {
      message: 'Data processed successfully',
      data,
    };
  }
}
