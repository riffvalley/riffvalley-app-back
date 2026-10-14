import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { InstagramTokenStorageService } from './instagram-token-storage.service';

describe('InstagramTokenStorageService', () => {
  const originalFetch = global.fetch;
  let originalEnv: NodeJS.ProcessEnv;
  let fetchMock: jest.Mock;
  let service: InstagramTokenStorageService;

  const response = (ok = true, status = 200, text = '') =>
    ({
      ok,
      status,
      text: jest.fn().mockResolvedValue(text),
    }) as unknown as Response;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.IG_HEROKU_API_TOKEN;
    delete process.env.IG_HEROKU_APP_NAME;
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new InstagramTokenStorageService();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('PATCHes Heroku when both credentials exist and does not use .env', async () => {
    process.env.IG_HEROKU_API_TOKEN = 'test-heroku-token';
    process.env.IG_HEROKU_APP_NAME = 'test-app';
    fetchMock.mockResolvedValueOnce(response());
    const readFile = jest.spyOn(fs, 'readFileSync');
    const writeFile = jest.spyOn(fs, 'writeFileSync');

    await service.persistAccessToken('refreshed-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.heroku.com/apps/test-app/config-vars',
      {
        method: 'PATCH',
        headers: {
          Accept: 'application/vnd.heroku+json; version=3',
          Authorization: 'Bearer test-heroku-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ IG_ACCESS_TOKEN: 'refreshed-token' }),
      },
    );
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it.each([
    ['only the API token', 'test-heroku-token', undefined],
    ['only the app name', undefined, 'test-app'],
    ['no Heroku settings', undefined, undefined],
  ])(
    'uses .env when configuration is %s',
    async (_label, apiToken, appName) => {
      if (apiToken) process.env.IG_HEROKU_API_TOKEN = apiToken;
      if (appName) process.env.IG_HEROKU_APP_NAME = appName;
      jest.spyOn(fs, 'readFileSync').mockReturnValue('PORT=3000\n');
      const writeFile = jest
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => undefined);

      await service.persistAccessToken('refreshed-token');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.env$/),
        'PORT=3000\n\nIG_ACCESS_TOKEN=refreshed-token\n',
      );
    },
  );

  it('replaces the existing .env token and preserves surrounding content', async () => {
    jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue('PORT=3000\nIG_ACCESS_TOKEN=old-token\nOTHER=value\n');
    const writeFile = jest
      .spyOn(fs, 'writeFileSync')
      .mockImplementation(() => undefined);

    await service.persistAccessToken('refreshed-token');

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.env$/),
      'PORT=3000\nIG_ACCESS_TOKEN=refreshed-token\nOTHER=value\n',
    );
  });

  it('absorbs Heroku HTTP and network errors without falling back to .env', async () => {
    process.env.IG_HEROKU_API_TOKEN = 'test-heroku-token';
    process.env.IG_HEROKU_APP_NAME = 'test-app';
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const readFile = jest.spyOn(fs, 'readFileSync');
    fetchMock.mockResolvedValueOnce(response(false, 503, 'unavailable'));

    await expect(
      service.persistAccessToken('refreshed-token'),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith(
      'Could not persist refreshed Instagram token to Heroku config vars: 503 unavailable',
    );
    expect(readFile).not.toHaveBeenCalled();

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(
      service.persistAccessToken('another-token'),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenLastCalledWith(
      'Could not persist refreshed Instagram token to Heroku config vars: Error: network down',
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it('absorbs .env read and write errors', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const readFile = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('read denied');
    });
    const writeFile = jest.spyOn(fs, 'writeFileSync');

    await expect(
      service.persistAccessToken('refreshed-token'),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not persist refreshed Instagram token to .env: Error: read denied',
      ),
    );
    expect(writeFile).not.toHaveBeenCalled();

    readFile.mockReturnValue('PORT=3000\n');
    writeFile.mockImplementation(() => {
      throw new Error('write denied');
    });
    await expect(
      service.persistAccessToken('refreshed-token'),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenLastCalledWith(
      expect.stringContaining(
        'Could not persist refreshed Instagram token to .env: Error: write denied',
      ),
    );
  });
});
