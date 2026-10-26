import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { DashboardSummaryController } from '../dashboard-summary.controller';
import { CrossDomainModule } from '../../cross-domain.module';
import { RatesModule } from '../../../../community/rates/rates.module';
import { DiscModule } from '../../../../catalog/discs/discs.module';
import { UserRoleGuard } from '../../../../identity/authorization/guards/user-role/user-role.guard';
import { META_MINIMUM_ROLE } from '../../../../identity/authorization/decorators/role-protected.decorator';

describe('DashboardSummaryController and module boundaries', () => {
  it('exposes authenticated GET /app/dashboard-summary without accepting a user id', () => {
    const handler = DashboardSummaryController.prototype.getSummary;
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      DashboardSummaryController,
    );

    expect(Reflect.getMetadata(PATH_METADATA, DashboardSummaryController)).toBe(
      'app',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'dashboard-summary',
    );
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, DashboardSummaryController),
    ).toBeUndefined();
    expect(guards).toContain(UserRoleGuard);
    expect(DashboardSummaryController.prototype.getSummary.length).toBe(1);
  });

  it('composes exported Catalog and Rates services through their domain modules', () => {
    const summaryImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CrossDomainModule,
    ) as unknown[];

    expect(summaryImports).toContain(RatesModule);
    expect(summaryImports).toContain(DiscModule);
  });
});
