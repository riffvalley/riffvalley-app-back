import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

@Injectable()
export class TiktokTokenCryptoService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  decrypt(value: string): string {
    try {
      const [iv, tag, encrypted] = value
        .split('.')
        .map((part) => Buffer.from(part, 'base64url'));
      if (!iv || !tag || !encrypted)
        throw new Error('Malformed encrypted value');
      const decipher = createDecipheriv('aes-256-gcm', this.getKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'No se pudieron descifrar los tokens de TikTok',
      );
    }
  }

  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private getKey(): Buffer {
    const secret = this.configService.get<string>(
      'TIKTOK_TOKEN_ENCRYPTION_KEY',
    );
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'TIKTOK_TOKEN_ENCRYPTION_KEY debe estar configurada con al menos 32 caracteres',
      );
    }
    return createHash('sha256').update(secret).digest();
  }
}
