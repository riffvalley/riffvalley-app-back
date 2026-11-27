import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportRowReceipt } from './entities/import-row-receipt.entity';
import { ImportRowReceiptsService } from './import-row-receipts.service';

@Module({
  imports: [TypeOrmModule.forFeature([ImportRowReceipt])],
  providers: [ImportRowReceiptsService],
  exports: [ImportRowReceiptsService],
})
export class ImportRowReceiptsModule {}
