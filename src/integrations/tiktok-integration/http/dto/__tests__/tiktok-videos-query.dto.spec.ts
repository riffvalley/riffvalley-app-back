import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TiktokVideosQueryDto } from '../tiktok-videos-query.dto';

describe('TiktokVideosQueryDto', () => {
  it('defaults pagination and transforms accepted numeric query values', async () => {
    const defaults = plainToInstance(TiktokVideosQueryDto, {});
    const explicit = plainToInstance(TiktokVideosQueryDto, {
      limit: '50',
      offset: '0',
    });

    expect(defaults).toMatchObject({ limit: 12, offset: 0 });
    expect(explicit).toMatchObject({ limit: 50, offset: 0 });
    await expect(validate(defaults)).resolves.toHaveLength(0);
    await expect(validate(explicit)).resolves.toHaveLength(0);
  });

  it.each([
    { limit: '0', offset: '0' },
    { limit: '51', offset: '0' },
    { limit: '12', offset: '-1' },
    { limit: '12.5', offset: '0' },
    { limit: 'invalid', offset: '0' },
  ])('rejects out-of-range or non-integer pagination: %o', async (query) => {
    const dto = plainToInstance(TiktokVideosQueryDto, query);

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
