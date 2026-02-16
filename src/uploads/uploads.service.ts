import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger('UploadsService');
  private readonly s3Client: S3Client;
  private readonly bucketName = 'spammusic-app';
  private readonly publicUrl = 'https://pub-14a7c3d3a8854a8c9a486cda803b1fb5.r2.dev';

  constructor() {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: 'https://3f542925dcaee0f7038108671296c9d0.r2.cloudflarestorage.com',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'images',
  ): Promise<{ url: string }> {
    const ext = file.originalname.split('.').pop();
    const key = `${folder}/${uuid()}.${ext}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return { url: `${this.publicUrl}/${key}` };
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Error uploading file');
    }
  }
}
