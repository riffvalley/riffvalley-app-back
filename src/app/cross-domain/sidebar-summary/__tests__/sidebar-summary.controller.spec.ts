import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../../../../app.module';
import { RequestsModule } from '../../../../community/requests/requests.module';
import { RatesModule } from '../../../../community/rates/rates.module';
import { DiscModule } from '../../../../catalog/discs/discs.module';
import { RequestsController } from '../../../../community/requests/requests.controller';
import { AuthorizationModule } from '../../../../identity/authorization/authorization.module';
import { UserRoleGuard } from '../../../../identity/authorization/guards/user-role/user-role.guard';
import { META_MINIMUM_ROLE } from '../../../../identity/authorization/decorators/role-protected.decorator';
import { SuggestionsModule } from '../../../../product/suggestions/suggestions.module';
import { SuggestionsService } from '../../../../product/suggestions/suggestions.service';
import { SuggestionsController } from '../../../../product/suggestions/suggestions.controller';
import { VersionsModule } from '../../../../product/versions/versions.module';
import { VersionsService } from '../../../../product/versions/versions.service';
import { VersionsController } from '../../../../product/versions/versions.controller';
import { RequestsService } from '../../../../community/requests/requests.service';
import { ValidRoles } from '../../../../identity/authorization/interfaces/valid-roles';
import { SidebarSummaryController } from '../sidebar-summary.controller';
import { CrossDomainModule } from '../../cross-domain.module';

describe('SidebarSummaryController and CrossDomainModule boundaries', () => {
  it('exposes an authenticated GET /app/sidebar-summary route', () => {
    const handler = SidebarSummaryController.prototype.getSummary;
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      SidebarSummaryController,
    );

    expect(Reflect.getMetadata(PATH_METADATA, SidebarSummaryController)).toBe(
      'app',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('sidebar-summary');
    expect(
      Reflect.getMetadata(META_MINIMUM_ROLE, SidebarSummaryController),
    ).toBeUndefined();
    expect(guards).toHaveLength(2);
    expect(guards).toContain(UserRoleGuard);
  });

  it('depends on domain modules one way and exports only the existing owner services', () => {
    const summaryImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CrossDomainModule,
    ) as unknown[];
    const appImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];

    expect(summaryImports).toEqual([
      AuthorizationModule,
      RatesModule,
      DiscModule,
      VersionsModule,
      RequestsModule,
      SuggestionsModule,
    ]);
    expect(appImports).toContain(CrossDomainModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, VersionsModule),
    ).toContain(VersionsService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, RequestsModule),
    ).toContain(RequestsService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, SuggestionsModule),
    ).toContain(SuggestionsService);
  });

  it('preserves the existing latest-version, request-list, and suggestions-list routes', () => {
    const existingRoutes = [
      [
        VersionsController.prototype.findLatestProductionVersion,
        'production/latest',
        undefined,
      ],
      [RequestsController.prototype.findAll, '/', ValidRoles.riffvalley],
      [SuggestionsController.prototype.findAll, '/', ValidRoles.superadmin],
    ] as const;

    expect(Reflect.getMetadata(PATH_METADATA, VersionsController)).toBe(
      'versions',
    );
    expect(Reflect.getMetadata(PATH_METADATA, RequestsController)).toBe(
      'requests',
    );
    expect(Reflect.getMetadata(PATH_METADATA, SuggestionsController)).toBe(
      'suggestions',
    );
    for (const [handler, path, role] of existingRoutes) {
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBe(role);
    }
  });
});
