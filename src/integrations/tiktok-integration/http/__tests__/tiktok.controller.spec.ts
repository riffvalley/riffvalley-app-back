import { HttpException, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Test, TestingModule } from '@nestjs/testing';
import { TiktokController } from '../tiktok.controller';
import { TiktokService } from '../../tiktok.service';

describe('TiktokController authorization metadata', () => {
  it('restricts connection operations to riffvalley and inherited superadmin access', () => {
    const routes = [
      ['connect', RequestMethod.POST, 'connect'],
      ['getConnection', RequestMethod.GET, 'connection'],
      ['disconnect', RequestMethod.DELETE, 'connection'],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, TiktokController)).toBe('tiktok');
    for (const [methodName, method, path] of routes) {
      const handler = TiktokController.prototype[methodName] as Function;
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, handler);
      expect(minimumRole).toBe(ValidRoles.riffvalley);
      expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
      expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(
        false,
      );
      expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(true);
      expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        UserRoleGuard,
      );
    }
  });

  it('leaves OAuth callback and video reads public', () => {
    const publicRoutes = [
      ['callback', RequestMethod.GET, 'callback'],
      ['findVideos', RequestMethod.GET, 'videos'],
      ['findVideoDetail', RequestMethod.GET, 'videos/:tiktokVideoId'],
    ] as const;

    for (const [methodName, method, path] of publicRoutes) {
      const handler = TiktokController.prototype[methodName] as Function;
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
    }
  });
});

describe('TiktokController OAuth callback behavior', () => {
  let controller: TiktokController;
  let moduleRef: TestingModule | undefined;
  let tiktokService: { completeConnection: jest.Mock };
  let configService: ConfigService;
  let configGet: jest.SpyInstance;
  let response: Response;

  beforeEach(async () => {
    tiktokService = { completeConnection: jest.fn() };
    configService = new ConfigService();
    configGet = jest.spyOn(configService, 'get');
    response = Object.create(null);
    response.redirect = jest.fn();
    moduleRef = await Test.createTestingModule({
      controllers: [TiktokController],
      providers: [
        { provide: TiktokService, useValue: tiktokService },
        { provide: ConfigService, useValue: configService },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(TiktokController);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it('delegates code and state and returns the result when no frontend redirect is configured', async () => {
    const result = { connected: true, openId: 'open-id' };
    tiktokService.completeConnection.mockResolvedValue(result);

    await expect(
      controller.callback(
        'auth-code',
        'oauth-state',
        undefined,
        response as Response,
      ),
    ).resolves.toBe(result);
    expect(tiktokService.completeConnection).toHaveBeenCalledWith(
      'auth-code',
      'oauth-state',
    );
    expect(configGet).toHaveBeenCalledWith('TIKTOK_FRONTEND_REDIRECT_URL');
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('redirects successful callbacks while preserving existing frontend query values', async () => {
    tiktokService.completeConnection.mockResolvedValue({ connected: true });
    configGet.mockReturnValue('https://frontend.test/settings?tab=oauth');

    await controller.callback(
      'auth-code',
      'oauth-state',
      undefined,
      response as Response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      'https://frontend.test/settings?tab=oauth&tiktok=connected',
    );
  });

  it('redirects provider callback errors when configured and otherwise preserves the HTTP error', async () => {
    configGet.mockReturnValue('https://frontend.test/settings');

    await controller.callback(
      undefined,
      undefined,
      'access_denied',
      response as Response,
    );

    expect(tiktokService.completeConnection).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(
      'https://frontend.test/settings?tiktok=error',
    );

    configGet.mockReturnValue(undefined);
    await expect(
      controller.callback(
        undefined,
        undefined,
        'access_denied',
        response as Response,
      ),
    ).rejects.toEqual(new HttpException('TikTok OAuth: access_denied', 400));
  });
});
