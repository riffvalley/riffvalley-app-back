import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { AuthModule } from 'src/identity/auth/auth.module';
import { CloudflareR2IntegrationModule } from 'src/integrations/cloudflare-r2-integration/cloudflare-r2-integration.module';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  imports: [AuthModule, CloudflareR2IntegrationModule],
  exports: [UploadsService],
})
export class UploadsModule {}
