import { Controller, Post, Body } from '@nestjs/common';
import { ScrapingService } from './scraping.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { ProcessManualDataDto } from './dto/process-manual-data.dto';

@Controller('scraping')
@Auth(ValidRoles.admin, ValidRoles.superUser)
export class ScrapingController {
  constructor(private readonly scrapingService: ScrapingService) {}

  @Post('/process-manual-data')
  async processManualData(@Body() dto: ProcessManualDataDto) {
    const data = await this.scrapingService.processManualData(dto);
    return {
      message: 'Data processed successfully',
      data,
    };
  }
}
