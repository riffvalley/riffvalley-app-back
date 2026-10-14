import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ContentsController } from './contents.controller';
import { ContentSchedulerService } from './content-scheduler.service';
import { ContentsService } from './contents.service';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';

describe('ContentsController daily link update authorization', () => {
  const contentsService = {} as ContentsService;
  const contentSchedulerService = {
    checkMissingSpotifyLinks: jest.fn(),
  } as unknown as ContentSchedulerService;
  const controller = new ContentsController(
    contentsService,
    contentSchedulerService,
  );
  const handler = ContentsController.prototype.triggerDailyLinkUpdate;

  it('requires the riffvalley minimum and inherits only through the central hierarchy', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ContentsController)).toBe(
      'contents',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'trigger-daily-link-update',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(1);
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(
      ValidRoles.riffvalley,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      UserRoleGuard,
    );

    expect(roleMeetsMinimum(ValidRoles.user, ValidRoles.riffvalley)).toBe(
      false,
    );
    expect(
      roleMeetsMinimum(ValidRoles.collaborator, ValidRoles.riffvalley),
    ).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.riffvalley, ValidRoles.riffvalley)).toBe(
      true,
    );
    expect(roleMeetsMinimum(ValidRoles.superadmin, ValidRoles.riffvalley)).toBe(
      true,
    );
  });

  it('preserves the scheduler delegation and HTTP response', async () => {
    contentSchedulerService.checkMissingSpotifyLinks = jest
      .fn()
      .mockResolvedValue(undefined);

    await expect(controller.triggerDailyLinkUpdate()).resolves.toEqual({
      message: 'Daily link update triggered',
    });
    expect(
      contentSchedulerService.checkMissingSpotifyLinks,
    ).toHaveBeenCalledTimes(1);
  });

  it('protects editorial Contents creation with the riffvalley minimum', () => {
    const create = ContentsController.prototype.create;
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, create)).toBe(
      ValidRoles.riffvalley,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, create)).toContain(
      UserRoleGuard,
    );
    expect(roleMeetsMinimum(ValidRoles.user, ValidRoles.riffvalley)).toBe(
      false,
    );
    expect(roleMeetsMinimum(ValidRoles.superadmin, ValidRoles.riffvalley)).toBe(
      true,
    );
  });
});
