import { ValidationPipe } from '@nestjs/common';
import { ArtistManagementQueryDto } from './artist-management-query.dto';

describe('ArtistManagementQueryDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transformQuery = (value: object) =>
    validationPipe.transform(value, {
      type: 'query',
      metatype: ArtistManagementQueryDto,
    });

  it.each([
    ['limit suffix', { limit: '7tail' }],
    ['limit decimal', { limit: '1.5' }],
    ['zero limit', { limit: '0' }],
    ['negative limit', { limit: '-1' }],
    ['non-numeric limit', { limit: 'abc' }],
    ['empty limit', { limit: '' }],
    ['limit outside safe integer range', { limit: '9007199254740992' }],
    ['offset suffix', { offset: '2tail' }],
    ['offset decimal', { offset: '2.5' }],
    ['negative offset', { offset: '-1' }],
    ['non-numeric offset', { offset: 'abc' }],
    ['empty offset', { offset: '' }],
    ['invalid boolean spelling', { needsReview: 'TRUE' }],
    ['invalid boolean value', { needsReview: 'yes' }],
    ['numeric boolean value', { needsReview: '1' }],
  ])('rejects %s with HTTP 400', async (_label, query) => {
    await expect(transformQuery(query)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('keeps omitted options absent and accepts valid filters without coercion', async () => {
    await expect(transformQuery({})).resolves.toBeInstanceOf(
      ArtistManagementQueryDto,
    );

    await expect(
      transformQuery({
        query: '  Bjo +  ',
        limit: '007',
        offset: '0',
        genreId: 'genre-id',
        needsReview: 'false',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        query: '  Bjo +  ',
        limit: '007',
        offset: '0',
        genreId: 'genre-id',
        needsReview: 'false',
      }),
    );
  });
});
