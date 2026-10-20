import { validate } from 'class-validator';
import {
  RiffValleyPlaylistStatus,
  RiffValleyPlaylistType,
} from '../entities/riff-valley-playlist.entity';
import { CreateRiffValleyPlaylistDto } from './create-riff-valley-playlist.dto';
import { UpdateRiffValleyPlaylistDto } from './update-riff-valley-playlist.dto';

describe('Riff Valley playlist DTOs', () => {
  const validCreateData = {
    name: 'Playlist',
    status: RiffValleyPlaylistStatus.EDITING,
    link: 'https://open.spotify.com/playlist/playlist-id',
    type: RiffValleyPlaylistType.GENERO,
    updateDate: '2026-08-20T10:00:00.000Z',
  };

  it('rejects an empty name on create', async () => {
    const dto = Object.assign(new CreateRiffValleyPlaylistDto(), {
      ...validCreateData,
      name: '',
    });

    const errors = await validate(dto);

    expect(
      errors.find(({ property }) => property === 'name')?.constraints,
    ).toHaveProperty('isNotEmpty');
  });

  it('rejects an empty name on partial update while allowing it to be omitted', async () => {
    const invalidDto = Object.assign(new UpdateRiffValleyPlaylistDto(), {
      name: '',
    });
    const omittedDto = new UpdateRiffValleyPlaylistDto();

    const invalidErrors = await validate(invalidDto);
    const omittedErrors = await validate(omittedDto);

    expect(
      invalidErrors.find(({ property }) => property === 'name')?.constraints,
    ).toHaveProperty('isNotEmpty');
    expect(omittedErrors).toHaveLength(0);
  });

  it('accepts a non-empty name on create and partial update', async () => {
    const createDto = Object.assign(
      new CreateRiffValleyPlaylistDto(),
      validCreateData,
    );
    const updateDto = Object.assign(new UpdateRiffValleyPlaylistDto(), {
      name: 'Renamed playlist',
    });

    await expect(validate(createDto)).resolves.toHaveLength(0);
    await expect(validate(updateDto)).resolves.toHaveLength(0);
  });
});
