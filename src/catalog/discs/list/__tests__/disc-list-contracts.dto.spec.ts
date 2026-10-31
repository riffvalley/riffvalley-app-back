import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  DiscListEligibility,
  DiscListMode,
  DiscListOptionsQueryDto,
  DiscListQueryDto,
  DiscListSuggestionsQueryDto,
  DiscListSort,
} from '../dto/disc-list-contracts.dto';
import {
  DiscListCardProjection,
  DiscListCommentItem,
  DiscListItemByMode,
  DiscListOptionsResponse,
  DiscListResponse,
} from '../disc-list.types';

describe('DiscList query contracts', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  async function validateList(query: Record<string, unknown>) {
    return validationPipe.transform(query, {
      type: 'query',
      metatype: DiscListQueryDto,
    }) as Promise<DiscListQueryDto>;
  }

  async function validateOptions(query: Record<string, unknown>) {
    return validationPipe.transform(query, {
      type: 'query',
      metatype: DiscListOptionsQueryDto,
    }) as Promise<DiscListOptionsQueryDto>;
  }

  async function validateSuggestions(query: Record<string, unknown>) {
    return validationPipe.transform(query, {
      type: 'query',
      metatype: DiscListSuggestionsQueryDto,
    }) as Promise<DiscListSuggestionsQueryDto>;
  }

  it('validates the lightweight suggestions query independently of list pagination and mode', async () => {
    await expect(validateSuggestions({ query: 'mol' })).resolves.toMatchObject({
      query: 'mol',
    });
    await expect(validateSuggestions({})).resolves.toBeInstanceOf(
      DiscListSuggestionsQueryDto,
    );
    await expect(
      validateSuggestions({ query: ['mol'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateSuggestions({ query: 'mol', offset: '20' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires one of the six established modes and defaults listing pagination to 20/0', async () => {
    const result = await validateList({ mode: 'all' });

    expect(result).toBeInstanceOf(DiscListQueryDto);
    expect(result).toMatchObject({
      mode: DiscListMode.ALL,
      limit: 20,
      offset: 0,
    });
    await expect(validateList({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(validateList({ mode: 'unknown' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts strict calendar date pairs and rejects invalid, incomplete, or inverted ranges', async () => {
    const result = await validateList({
      mode: 'all',
      dateRange: ['2026-01-01', '2026-12-31'],
    });

    expect(result.dateRange?.map((date) => date.toISOString())).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-12-31T00:00:00.000Z',
    ]);

    for (const dateRange of [
      ['2026-02-31', '2026-03-01'],
      ['2026-01-01'],
      ['2026-01-01', '2026-01-02', '2026-01-03'],
      ['2026-12-31', '2026-01-01'],
      ['2026-01-01T00:00:00Z', '2026-01-02'],
    ]) {
      await expect(
        validateList({ mode: 'all', dateRange }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('validates UUID filters, integer offset, and bounded positive limit', async () => {
    const artistId = 'e1234567-89ab-4cde-8123-456789abcdef';
    const valid = await validateList({
      mode: 'favorites',
      countryId: 'a1234567-89ab-4cde-8123-456789abcdef',
      artistId,
      genreId: 'b1234567-89ab-4cde-8123-456789abcdef',
      offset: '40',
      limit: '100',
    });

    expect(valid).toMatchObject({ offset: 40, limit: 100, artistId });
    await expect(
      validateOptions({ mode: 'all', artistId }),
    ).resolves.toMatchObject({ artistId });

    for (const input of [
      { mode: 'all', countryId: 'not-a-uuid' },
      { mode: 'all', artistId: 'not-a-uuid' },
      { mode: 'all', genreId: 'not-a-uuid' },
      { mode: 'all', offset: '-1' },
      { mode: 'all', offset: '1.5' },
      { mode: 'all', limit: '0' },
      { mode: 'all', limit: '101' },
    ]) {
      await expect(validateList(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    await expect(
      validateOptions({ mode: 'all', artistId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts CSV or repeated genreIds, normalizes duplicates, and rejects empty or invalid IDs', async () => {
    const ids = [
      'b1234567-89ab-4cde-8123-456789abcdef',
      'c1234567-89ab-4cde-8123-456789abcdef',
      'd1234567-89ab-4cde-8123-456789abcdef',
    ];
    await expect(
      validateList({
        mode: 'all',
        genreIds: `${ids[0]},${ids[1]},${ids[2]},${ids[0]}`,
      }),
    ).resolves.toMatchObject({ genreIds: ids });
    await expect(
      validateOptions({
        mode: 'all',
        genreIds: [ids[0], ids[0].toUpperCase()],
      }),
    ).resolves.toMatchObject({ genreIds: [ids[0]] });
    await expect(
      validateList({ mode: 'all', genreIds: [] }),
    ).resolves.toMatchObject({ genreIds: [] });
    await expect(
      validateList({ mode: 'all', genreIds: `${ids[0]},` }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateList({ mode: 'all', genreIds: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts only allowlisted sorts valid for the selected mode', async () => {
    await expect(
      validateList({ mode: 'all', sort: DiscListSort.AVERAGE_RATE_DESC }),
    ).resolves.toMatchObject({ sort: DiscListSort.AVERAGE_RATE_DESC });
    await expect(
      validateList({ mode: 'comments', sort: DiscListSort.CREATED_AT_DESC }),
    ).resolves.toMatchObject({ sort: DiscListSort.CREATED_AT_DESC });

    for (const input of [
      { mode: 'all', sort: 'disc.averageRate DESC' },
      { mode: 'comments', sort: DiscListSort.AVERAGE_RATE_DESC },
    ]) {
      await expect(validateList(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('limits the all-mode eligibility filter to supported values and mode', async () => {
    await expect(
      validateList({
        mode: 'all',
        eligibility: DiscListEligibility.UNVOTED_RATE,
      }),
    ).resolves.toMatchObject({ eligibility: DiscListEligibility.UNVOTED_RATE });

    await expect(
      validateList({ mode: 'all', eligibility: DiscListEligibility.NO_RATES }),
    ).resolves.toMatchObject({ eligibility: DiscListEligibility.NO_RATES });

    await expect(
      validateList({
        mode: 'rates',
        eligibility: DiscListEligibility.UNVOTED_RATE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateList({ mode: 'all', eligibility: 'unreviewed' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the shared mode and filters for options, without pagination or user identity input', async () => {
    const result = await validateOptions({
      mode: 'comments',
      query: 'metal',
      dateRange: ['2026-01-01', '2026-12-31'],
      countryId: 'a1234567-89ab-4cde-8123-456789abcdef',
      genreId: 'b1234567-89ab-4cde-8123-456789abcdef',
    });

    expect(result).toBeInstanceOf(DiscListOptionsQueryDto);
    await expect(
      validateOptions({ mode: 'all', limit: '20' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateOptions({
        mode: 'all',
        userId: 'a1234567-89ab-4cde-8123-456789abcdef',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps comments as a typed comment entry with only the comment view projection', () => {
    const disc: DiscListCardProjection = {
      id: 'disc-id',
      name: 'Record',
      image: null,
      releaseDate: '2026-01-01',
      link: null,
      ep: false,
      debut: false,
      artist: { name: 'Artist', country: null },
      genre: null,
      averageRate: null,
      averageCover: null,
      voteCount: 0,
      commentCount: 1,
      userRate: null,
      favoriteId: null,
      pendingId: null,
    };
    const commentItem: DiscListCommentItem = {
      itemType: 'comment',
      entryId: 'comment-id',
      comment: 'Great record',
      createdAt: '2026-10-01T12:00:00.000Z',
      disc: {
        id: disc.id,
        name: disc.name,
        image: disc.image,
        releaseDate: disc.releaseDate,
        artist: disc.artist,
        genre: disc.genre,
      },
    };
    const itemsByMode: DiscListItemByMode = {
      all: { ...disc, itemType: 'disc', entryId: disc.id },
      rates: { ...disc, itemType: 'rate', entryId: 'rate-id' },
      covers: { ...disc, itemType: 'cover', entryId: 'cover-rate-id' },
      comments: commentItem,
      favorites: { ...disc, itemType: 'favorite', entryId: 'favorite-id' },
      pendientes: { ...disc, itemType: 'pending', entryId: 'pending-id' },
    };
    const response: DiscListResponse = {
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      limit: 20,
      data: [commentItem],
    };
    const options: DiscListOptionsResponse = {
      countries: [{ id: 'country-id', name: 'Norway', isoCode: 'NO' }],
      genres: [{ id: 'genre-id', name: 'Black Metal', color: null }],
    };

    expect(response.data[0].itemType).toBe('comment');
    expect(response.totalItems).toBe(1);
    expect(Object.keys(itemsByMode)).toHaveLength(6);
    expect(options.countries[0].isoCode).toBe('NO');
  });
});
