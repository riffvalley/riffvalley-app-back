import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  imports: [AuthModule],
  exports: [UploadsService],
})
export class UploadsModule {}
