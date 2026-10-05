import { Controller, Post, Body } from '@nestjs/common';
import { CatalogImportService } from '../import/catalog-import.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { ProcessManualDataDto } from '../dto/process-manual-data.dto';

@Controller('catalog/import')
@Auth(ValidRoles.admin, ValidRoles.superUser)
export class CatalogImportController {
  constructor(private readonly catalogImportService: CatalogImportService) {}

  @Post('manual')
  async processManualData(@Body() dto: ProcessManualDataDto) {
    const data = await this.catalogImportService.processManualData(dto);
    return {
      message: 'Data processed successfully',
      data,
    };
  }
}
