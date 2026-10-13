import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ListsController } from './list.controller';
import { ListsService } from './list.service';
import { GenerateWpPostsQueryDto } from './dto/generate-wp-posts-query.dto';
import { META_MINIMUM_ROLE } from 'src/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/auth/guards/user-role/user-role.guard';
import { roleMeetsMinimum, ValidRoles } from 'src/auth/interfaces/valid-roles';

describe('ListsController WordPress authorization', () => {
  let controller: ListsController;
  let listsService: {
    generateWordPressPosts: jest.Mock;
    generateBestDiscsWordPressPost: jest.Mock;
  };

  beforeEach(() => {
    listsService = {
      generateWordPressPosts: jest.fn(),
      generateBestDiscsWordPressPost: jest.fn(),
    };
    controller = new ListsController(listsService as unknown as ListsService);
  });

  it.each([
    ['generateWpPosts', ':id/wp-posts'],
    ['generateWpBestPost', ':id/wp-best-post'],
  ] as const)('protects %s at %s with the riffvalley minimum', (name, path) => {
    const handler = ListsController.prototype[name];
    expect(Reflect.getMetadata(PATH_METADATA, ListsController)).toBe('lists');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
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

  it('preserves the wp-posts position argument and service response', async () => {
    const query = { position: 3 } as GenerateWpPostsQueryDto;
    const response = [{ wpPostId: 27, link: 'https://wordpress.example/post' }];
    listsService.generateWordPressPosts.mockResolvedValue(response);

    await expect(controller.generateWpPosts('list-id', query)).resolves.toBe(
      response,
    );
    expect(listsService.generateWordPressPosts).toHaveBeenCalledWith(
      'list-id',
      3,
    );
  });

  it('preserves the wp-best-post service response', async () => {
    const response = { wpPostId: 28, link: 'https://wordpress.example/best' };
    listsService.generateBestDiscsWordPressPost.mockResolvedValue(response);

    await expect(controller.generateWpBestPost('list-id')).resolves.toBe(
      response,
    );
    expect(listsService.generateBestDiscsWordPressPost).toHaveBeenCalledWith(
      'list-id',
    );
  });

  it('protects editorial list creation with the riffvalley minimum', () => {
    const create = ListsController.prototype.create;
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
