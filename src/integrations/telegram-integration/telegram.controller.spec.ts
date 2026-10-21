import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';
import { TelegramController } from './telegram.controller';
import { TelegramIntegrationModule } from './telegram-integration.module';
import { TelegramService } from './telegram.service';
import { NewsModule } from 'src/product/news/news.module';
import { AuthorizationModule } from 'src/identity/authorization/authorization.module';

describe('TelegramController authorization metadata', () => {
  it('restricts channel-posts to riffvalley and inherited superadmin access', () => {
    const handler = TelegramController.prototype.getChannelPosts;

    expect(Reflect.getMetadata(PATH_METADATA, TelegramController)).toBe(
      'telegram',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('channel-posts');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, handler);
    expect(minimumRole).toBe(ValidRoles.riffvalley);
    expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(true);
    expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      UserRoleGuard,
    );
  });

  it('leaves paginated posts public', () => {
    const handler = TelegramController.prototype.getPosts;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('posts');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, handler)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });
});

describe('TelegramIntegrationModule dependencies', () => {
  it('provides and exports TelegramService for NewsModule', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, TelegramIntegrationModule),
    ).toContain(AuthorizationModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, TelegramIntegrationModule),
    ).toContain(TelegramService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, TelegramIntegrationModule),
    ).toContain(TelegramService);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, NewsModule)).toContain(
      TelegramIntegrationModule,
    );
  });
});
