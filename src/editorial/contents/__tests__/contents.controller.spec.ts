import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { ContentsController } from '../contents.controller';
import { DiscLinkMaintenanceService } from 'src/catalog/discs/maintenance/disc-link-maintenance.service';
import { ContentsService } from '../contents.service';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';
import { Content } from '../entities/content.entity';
import { FindContentByMonthQueryDto } from '../dto/find-content-by-month-query.dto';

describe('ContentsController daily link update authorization', () => {
  const makeController = async (
    contentsService: object = {},
    discLinkMaintenanceService: Pick<
      DiscLinkMaintenanceService,
      'checkMissingSpotifyLinks'
    > = {
      checkMissingSpotifyLinks: jest.fn<
        ReturnType<DiscLinkMaintenanceService['checkMissingSpotifyLinks']>,
        Parameters<DiscLinkMaintenanceService['checkMissingSpotifyLinks']>
      >(),
    },
  ) => {
    const builder = Test.createTestingModule({
      controllers: [ContentsController],
      providers: [
        { provide: ContentsService, useValue: contentsService },
        {
          provide: DiscLinkMaintenanceService,
          useValue: discLinkMaintenanceService,
        },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthGuard())
      .useValue({ canActivate: () => true });
    const module = await builder.compile();

    return {
      controller: module.get(ContentsController),
      module,
      discLinkMaintenanceService,
    };
  };

  it('requires the riffvalley minimum and inherits only through the central hierarchy', async () => {
    const { controller, module } = await makeController();
    const handler = ContentsController.prototype.triggerDailyLinkUpdate;

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
    await module.close();
    expect(controller).toBeInstanceOf(ContentsController);
  });

  it('preserves the scheduler delegation and HTTP response', async () => {
    const maintenance = {
      checkMissingSpotifyLinks: jest
        .fn<
          ReturnType<DiscLinkMaintenanceService['checkMissingSpotifyLinks']>,
          Parameters<DiscLinkMaintenanceService['checkMissingSpotifyLinks']>
        >()
        .mockResolvedValue(undefined),
    };
    const { controller, module } = await makeController({}, maintenance);

    await expect(controller.triggerDailyLinkUpdate()).resolves.toEqual({
      message: 'Daily link update triggered',
    });
    expect(maintenance.checkMissingSpotifyLinks).toHaveBeenCalledTimes(1);
    await module.close();
  });

  it('propagates manual maintenance failures unchanged', async () => {
    const error = new Error('maintenance failed');
    const maintenance = {
      checkMissingSpotifyLinks: jest
        .fn<
          ReturnType<DiscLinkMaintenanceService['checkMissingSpotifyLinks']>,
          Parameters<DiscLinkMaintenanceService['checkMissingSpotifyLinks']>
        >()
        .mockRejectedValue(error),
    };
    const { controller, module } = await makeController({}, maintenance);

    await expect(controller.triggerDailyLinkUpdate()).rejects.toBe(error);
    await module.close();
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

describe('ContentsController monthly agenda', () => {
  it('keeps the public route and forwards validated year and month unchanged', async () => {
    const result = [Object.assign(new Content(), { id: 'content-id' })];
    const contentsService = {
      findByMonth: jest
        .fn<
          ReturnType<ContentsService['findByMonth']>,
          Parameters<ContentsService['findByMonth']>
        >()
        .mockResolvedValue(result),
    };
    const builder = Test.createTestingModule({
      controllers: [ContentsController],
      providers: [
        { provide: ContentsService, useValue: contentsService },
        {
          provide: DiscLinkMaintenanceService,
          useValue: { checkMissingSpotifyLinks: jest.fn() },
        },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthGuard())
      .useValue({ canActivate: () => true });
    const module = await builder.compile();
    const controller = module.get(ContentsController);
    const handler = ContentsController.prototype.findByMonth;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('by-month');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();

    await expect(
      controller.findByMonth(
        Object.assign(new FindContentByMonthQueryDto(), {
          year: 2026,
          month: 12,
        }),
      ),
    ).resolves.toBe(result);
    expect(contentsService.findByMonth).toHaveBeenCalledWith(2026, 12);
    await module.close();
  });
});
