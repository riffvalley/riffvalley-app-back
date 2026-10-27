import { ParseUUIDPipe, Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { UserRoleGuard } from 'src/identity/auth/guards/user-role/user-role.guard';
import { User } from 'src/identity/auth/entities/user.entity';
import { RatesArtistLastfmController } from '../rates-artist-lastfm.controller';

describe('RatesArtistLastfmController', () => {
  it('registers an authenticated UUID route and delegates the internal artist ID', async () => {
    const service = {
      getArtistInfo: jest.fn().mockResolvedValue({ artistId: 'artist-id' }),
    };
    const controller = new RatesArtistLastfmController(service as never);
    const user = Object.assign(new User(), { id: 'session-user-id' });
    const handler = RatesArtistLastfmController.prototype.getArtistInfo;
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      handler,
    ) as Type<unknown>[];

    expect(
      Reflect.getMetadata(PATH_METADATA, RatesArtistLastfmController),
    ).toBe('rates/artists');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':artistId/lastfm',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(guards).toContain(UserRoleGuard);
    await expect(
      controller.getArtistInfo('123e4567-e89b-42d3-a456-426614174000', user),
    ).resolves.toEqual({ artistId: 'artist-id' });
    expect(service.getArtistInfo).toHaveBeenCalledWith(
      '123e4567-e89b-42d3-a456-426614174000',
      'session-user-id',
    );
    await expect(
      new ParseUUIDPipe().transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'artistId',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
