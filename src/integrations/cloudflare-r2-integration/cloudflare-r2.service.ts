import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class CloudflareR2Service {
  private readonly s3Client: S3Client;
  private readonly bucketName = 'spammusic-app';
  private readonly publicUrl =
    'https://pub-14a7c3d3a8854a8c9a486cda803b1fb5.r2.dev';

  constructor() {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint:
        'https://3f542925dcaee0f7038108671296c9d0.r2.cloudflarestorage.com',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async uploadObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return `${this.publicUrl}/${key}`;
  }
}
