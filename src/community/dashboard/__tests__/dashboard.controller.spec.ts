import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { UserRoleGuard } from '../../../identity/authorization/guards/user-role/user-role.guard';
import { AuthorizationModule } from '../../../identity/authorization/authorization.module';
import { CommunityDashboardController } from '../dashboard.controller';
import { CommunityDashboardModule } from '../dashboard.module';
import { CommunityDashboardYearQueryDto } from '../dto/community-dashboard-year-query.dto';

describe('CommunityDashboardController', () => {
  it('imports the module that provides dependencies for the authentication guard', () => {
    const imports: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CommunityDashboardModule,
    );
    expect(imports).toContain(AuthorizationModule);
  });

  it('exposes both routes behind the standard authenticated guards', () => {
    const controller = CommunityDashboardController;
    expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(
      'community/dashboard',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(
      UserRoleGuard,
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, controller.prototype.getRankings),
    ).toBe('rankings');
    expect(
      Reflect.getMetadata(PATH_METADATA, controller.prototype.getStats),
    ).toBe('stats');
    expect(
      Reflect.getMetadata(METHOD_METADATA, controller.prototype.getRankings),
    ).toBe(0);
    expect(
      Reflect.getMetadata(METHOD_METADATA, controller.prototype.getStats),
    ).toBe(0);
  });

  it('converts integer years and rejects missing, fractional, and pre-2025 years', async () => {
    await expect(
      validate(
        plainToInstance(CommunityDashboardYearQueryDto, { year: '2026' }),
      ),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(CommunityDashboardYearQueryDto, {})),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(CommunityDashboardYearQueryDto, { year: '2026.5' }),
      ),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(CommunityDashboardYearQueryDto, { year: '2024' }),
      ),
    ).resolves.not.toHaveLength(0);
  });
});
