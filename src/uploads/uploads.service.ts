import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { CloudflareR2Service } from 'src/integrations/cloudflare-r2-integration/cloudflare-r2.service';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger('UploadsService');

  constructor(private readonly cloudflareR2Service: CloudflareR2Service) {}

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'images',
  ): Promise<{ url: string }> {
    const ext = file.originalname.split('.').pop();
    const key = `${folder}/${uuid()}.${ext}`;

    try {
      const url = await this.cloudflareR2Service.uploadObject(
        key,
        file.buffer,
        file.mimetype,
      );
      return { url };
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Error uploading file');
    }
  }
}
