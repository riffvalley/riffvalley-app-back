import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { TiktokTokenCryptoService } from '../token-crypto.service';

describe('TiktokTokenCryptoService', () => {
  const serviceFor = (secret?: string) =>
    new TiktokTokenCryptoService(
      Object.assign(new ConfigService(), {
        get: jest.fn().mockReturnValue(secret),
      }),
    );

  it('encrypts and decrypts tokens while hashing OAuth state deterministically', () => {
    const service = serviceFor('a-stable-encryption-key-that-is-long-enough');
    const encrypted = service.encrypt('provider-access-token');

    expect(encrypted).not.toContain('provider-access-token');
    expect(encrypted.split('.')).toHaveLength(3);
    expect(service.decrypt(encrypted)).toBe('provider-access-token');
    expect(service.hash('oauth-state')).toBe(service.hash('oauth-state'));
  });

  it('rejects missing/short keys and corrupted encrypted values', () => {
    expect(() => serviceFor('short').encrypt('token')).toThrow(
      new InternalServerErrorException(
        'TIKTOK_TOKEN_ENCRYPTION_KEY debe estar configurada con al menos 32 caracteres',
      ),
    );
    expect(() => serviceFor(undefined).encrypt('token')).toThrow(
      InternalServerErrorException,
    );

    const service = serviceFor('a-stable-encryption-key-that-is-long-enough');
    expect(() => service.decrypt('not-an-encrypted-token')).toThrow(
      new InternalServerErrorException(
        'No se pudieron descifrar los tokens de TikTok',
      ),
    );
  });
});
