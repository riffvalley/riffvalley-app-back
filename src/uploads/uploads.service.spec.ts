import { InternalServerErrorException, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { CloudflareR2Service } from 'src/integrations/cloudflare-r2-integration/cloudflare-r2.service';
import { UploadsService } from './uploads.service';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'generated-object-id') }));

describe('UploadsService', () => {
  let cloudflareR2Service: jest.Mocked<
    Pick<CloudflareR2Service, 'uploadObject'>
  >;
  let service: UploadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    cloudflareR2Service = {
      uploadObject: jest
        .fn()
        .mockResolvedValue(
          'https://public.example/images/generated-object-id.png',
        ),
    };
    service = new UploadsService(
      cloudflareR2Service as unknown as CloudflareR2Service,
    );
  });

  it('keeps key naming in Uploads and returns the provider URL in the existing response shape', async () => {
    const buffer = Buffer.from('image-bytes');
    const file = {
      originalname: 'cover.final.png',
      buffer,
      mimetype: 'image/png',
    } as Express.Multer.File;

    await expect(service.uploadFile(file, 'images')).resolves.toEqual({
      url: 'https://public.example/images/generated-object-id.png',
    });
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(cloudflareR2Service.uploadObject).toHaveBeenCalledWith(
      'images/generated-object-id.png',
      buffer,
      'image/png',
    );
  });

  it('preserves the existing upload error response when R2 rejects the operation', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    cloudflareR2Service.uploadObject.mockRejectedValueOnce(
      new Error('AccessDenied'),
    );

    await expect(
      service.uploadFile(
        {
          originalname: 'cover.png',
          buffer: Buffer.from('image-bytes'),
          mimetype: 'image/png',
        } as Express.Multer.File,
        'images',
      ),
    ).rejects.toMatchObject({
      constructor: InternalServerErrorException,
      message: 'Error uploading file',
      response: { message: 'Error uploading file', statusCode: 500 },
    });
    expect(loggerError).toHaveBeenCalledWith(expect.any(Error));
  });
});
