import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListsController } from './list.controller';
import { ListsService } from './list.service';
import { GenerateWpPostsQueryDto } from './dto/generate-wp-posts-query.dto';
import {
  ListYearMonthParamsDto,
  ListYearParamsDto,
} from './dto/list-period-params.dto';
import { META_MINIMUM_ROLE } from 'src/identity/auth/decorators/role-protected.decorator';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import {
  roleMeetsMinimum,
  ValidRoles,
} from 'src/identity/auth/interfaces/valid-roles';

describe('ListsController WordPress authorization', () => {
  let controller: ListsController;
  let listsService: {
    generateWordPressPosts: jest.Mock;
    generateBestDiscsWordPressPost: jest.Mock;
    findPastWeeklyListsByMonth: jest.Mock;
    findPastMonthListsByYear: jest.Mock;
    findPastVideoListsByYear: jest.Mock;
  };

  beforeEach(() => {
    listsService = {
      generateWordPressPosts: jest.fn(),
      generateBestDiscsWordPressPost: jest.fn(),
      findPastWeeklyListsByMonth: jest.fn(),
      findPastMonthListsByYear: jest.fn(),
      findPastVideoListsByYear: jest.fn(),
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

  describe('historical period route parameters', () => {
    const validationPipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    async function validateParams<T extends object>(
      value: Record<string, string>,
      metatype: new () => T,
    ): Promise<T> {
      return validationPipe.transform(value, {
        type: 'param',
        metatype,
        data: undefined,
      });
    }

    it.each([
      ['weekly', { year: '2026', month: '1' }, 1],
      ['weekly', { year: '2026', month: '12' }, 12],
    ])(
      'preserves valid %s period parameters',
      async (_route, params, month) => {
        const dto = await validateParams(params, ListYearMonthParamsDto);
        const response = [{ id: 'list-id' }];
        listsService.findPastWeeklyListsByMonth.mockResolvedValue(response);

        await expect(controller.findPastWeeklyByMonth(dto)).resolves.toBe(
          response,
        );
        expect(listsService.findPastWeeklyListsByMonth).toHaveBeenCalledWith(
          2026,
          month,
        );
      },
    );

    it.each([
      ['monthly', 'findPastMonthByYear'],
      ['video', 'findPastVideoByYear'],
      ['duplicate video route', 'findPastVideosByYear'],
    ] as const)(
      'preserves the valid %s year endpoint contract',
      async (_route, handlerName) => {
        const dto = await validateParams({ year: '2026' }, ListYearParamsDto);
        const response = [{ id: 'list-id' }];
        listsService.findPastMonthListsByYear.mockResolvedValue(response);
        listsService.findPastVideoListsByYear.mockResolvedValue(response);

        await expect(controller[handlerName](dto)).resolves.toBe(response);
        if (handlerName === 'findPastMonthByYear') {
          expect(listsService.findPastMonthListsByYear).toHaveBeenCalledWith(
            2026,
          );
        } else {
          expect(listsService.findPastVideoListsByYear).toHaveBeenCalledWith(
            2026,
          );
        }
      },
    );

    it.each([
      ['empty year', { year: '' }, ListYearParamsDto],
      ['non-numeric year', { year: 'year' }, ListYearParamsDto],
      ['year suffix', { year: '2026abc' }, ListYearParamsDto],
      ['negative year', { year: '-2026' }, ListYearParamsDto],
      ['decimal year', { year: '2026.5' }, ListYearParamsDto],
      ['year below Date constructor range', { year: '99' }, ListYearParamsDto],
      [
        'year above Date constructor range',
        { year: '275760' },
        ListYearParamsDto,
      ],
      ['month zero', { year: '2026', month: '0' }, ListYearMonthParamsDto],
      ['month thirteen', { year: '2026', month: '13' }, ListYearMonthParamsDto],
      ['negative month', { year: '2026', month: '-1' }, ListYearMonthParamsDto],
      ['empty month', { year: '2026', month: '' }, ListYearMonthParamsDto],
      [
        'non-numeric month',
        { year: '2026', month: 'month' },
        ListYearMonthParamsDto,
      ],
      [
        'month suffix',
        { year: '2026', month: '10xyz' },
        ListYearMonthParamsDto,
      ],
      ['decimal month', { year: '2026', month: '1.5' }, ListYearMonthParamsDto],
    ])(
      'returns HTTP 400 for %s without invoking the service',
      async (_case, params, metatype) => {
        try {
          await validateParams(params, metatype);
          fail('Expected parameter validation to reject the request');
        } catch (error) {
          expect(error).toBeInstanceOf(BadRequestException);
          expect((error as BadRequestException).getStatus()).toBe(400);
        }
        expect(listsService.findPastWeeklyListsByMonth).not.toHaveBeenCalled();
        expect(listsService.findPastMonthListsByYear).not.toHaveBeenCalled();
        expect(listsService.findPastVideoListsByYear).not.toHaveBeenCalled();
      },
    );

    it('accepts the supported year endpoints and rejects years that Date cannot represent as a full period', async () => {
      await expect(
        validateParams({ year: '100' }, ListYearParamsDto),
      ).resolves.toMatchObject({ year: 100 });
      await expect(
        validateParams({ year: '275759' }, ListYearParamsDto),
      ).resolves.toMatchObject({ year: 275759 });
      await expect(
        validateParams({ year: '1' }, ListYearParamsDto),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
