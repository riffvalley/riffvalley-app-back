const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CloudflareR2Service } from './cloudflare-r2.service';

describe('CloudflareR2Service', () => {
  let service: CloudflareR2Service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CloudflareR2Service();
  });

  it('configures the S3 client for the existing R2 endpoint and uploads the object unchanged', async () => {
    const body = Buffer.from('image-bytes');
    mockSend.mockResolvedValueOnce({});

    const url = await service.uploadObject(
      'images/object-id.png',
      body,
      'image/png',
    );

    const clientConfig = (S3Client as jest.Mock).mock.calls[0][0];
    expect(clientConfig.region).toBe('auto');
    expect(clientConfig.endpoint).toBe(
      'https://3f542925dcaee0f7038108671296c9d0.r2.cloudflarestorage.com',
    );
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'spammusic-app',
      Key: 'images/object-id.png',
      Body: body,
      ContentType: 'image/png',
    });
    expect(mockSend).toHaveBeenCalledWith({
      input: {
        Bucket: 'spammusic-app',
        Key: 'images/object-id.png',
        Body: body,
        ContentType: 'image/png',
      },
    });
    expect(url).toBe(
      'https://pub-14a7c3d3a8854a8c9a486cda803b1fb5.r2.dev/images/object-id.png',
    );
  });

  it('propagates SDK errors to Uploads for its existing error mapping', async () => {
    const sdkError = new Error('AccessDenied');
    mockSend.mockRejectedValueOnce(sdkError);

    await expect(
      service.uploadObject(
        'images/object-id.png',
        Buffer.from('data'),
        'image/png',
      ),
    ).rejects.toBe(sdkError);
  });
});
