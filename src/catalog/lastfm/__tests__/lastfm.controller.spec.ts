import { BadRequestException, RequestMethod } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import { LastfmController } from '../lastfm.controller';
import { LastfmService } from '../lastfm.service';
import { User } from 'src/identity/auth/entities/user.entity';

describe('LastfmController artist query', () => {
  const getArtistInfo = jest.fn();
  let controller: LastfmController;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    getArtistInfo.mockReset();
    moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [LastfmController],
      providers: [
        { provide: LastfmService, useValue: { getArtistInfo } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
      ],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: jest.fn() })
      .compile();
    controller = moduleRef.get(LastfmController);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it.each([
    undefined,
    '',
    '   ',
    '\t\n',
    ['Artist one', 'Artist two'],
    { name: 'Artist' },
  ])(
    'rejects invalid artist query value %p without calling the service',
    (artist) => {
      let error: unknown;
      try {
        controller.getArtistInfo(artist);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect(getArtistInfo).not.toHaveBeenCalled();
    },
  );

  it.each(['The Artist', 'Björk + Co / 東京'])(
    'passes the valid name %s unchanged and returns the service payload',
    async (artist) => {
      const payload = { name: artist, stats: { listeners: '42' } };
      getArtistInfo.mockResolvedValue(payload);

      await expect(controller.getArtistInfo(artist)).resolves.toBe(payload);
      expect(getArtistInfo).toHaveBeenCalledWith(artist);
    },
  );
});

describe('LastfmController authorization metadata', () => {
  it('restricts fill-images to superadmin and leaves artist reads public', () => {
    const fillImages = LastfmController.prototype.fillWeeklyImages;
    const artistRead = LastfmController.prototype.getArtistInfo;

    expect(Reflect.getMetadata(PATH_METADATA, LastfmController)).toBe('lastfm');
    expect(Reflect.getMetadata(PATH_METADATA, fillImages)).toBe('fill-images');
    expect(Reflect.getMetadata(METHOD_METADATA, fillImages)).toBe(
      RequestMethod.POST,
    );
    const minimumRole = Reflect.getMetadata(META_MINIMUM_ROLE, fillImages);
    expect(minimumRole).toBe(ValidRoles.superadmin);
    expect(roleMeetsMinimum(ValidRoles.user, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.collaborator, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.riffvalley, minimumRole)).toBe(false);
    expect(roleMeetsMinimum(ValidRoles.superadmin, minimumRole)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, fillImages)).toContain(
      UserRoleGuard,
    );

    expect(Reflect.getMetadata(PATH_METADATA, artistRead)).toBe('artist');
    expect(Reflect.getMetadata(METHOD_METADATA, artistRead)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(META_MINIMUM_ROLE, artistRead)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, artistRead)).toBeUndefined();
  });
});
