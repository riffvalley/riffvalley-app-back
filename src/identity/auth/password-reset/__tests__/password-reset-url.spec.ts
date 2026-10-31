import { ServiceUnavailableException } from '@nestjs/common';
import { createPasswordResetLink } from '../password-reset-url';

describe('createPasswordResetLink', () => {
  const token = 'a'.repeat(43);

  it.each([
    ['prod app', 'https://app.riffvalley.es/reset-password', 'prod'],
    ['prod beta', 'https://beta.riffvalley.es/reset-password', 'prod'],
    ['local with port', 'http://localhost:5173/reset-password', 'dev'],
  ])('adds the token in the fragment for %s', (_name, baseUrl, stage) => {
    expect(createPasswordResetLink(baseUrl, stage, token)).toBe(
      `${baseUrl}#token=${token}`,
    );
  });

  it.each([
    ['http://app.riffvalley.es/reset-password', 'prod'],
    ['https://evil.example/reset-password', 'prod'],
    ['https://app.riffvalley.es/reset-password', 'dev'],
    ['http://localhost:5173/reset-password', 'prod'],
    ['http://localhost:5173/reset-password?next=evil', 'dev'],
    ['http://localhost:5173/reset-password#existing', 'dev'],
    ['https://user@beta.riffvalley.es/reset-password', 'prod'],
  ])('rejects unsafe URL %s', (url, stage) => {
    expect(() => createPasswordResetLink(url, stage, token)).toThrow(
      ServiceUnavailableException,
    );
  });
});
