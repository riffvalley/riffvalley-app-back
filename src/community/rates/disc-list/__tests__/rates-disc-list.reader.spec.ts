import 'reflect-metadata';
import { CommunityListQueryDto } from 'src/community/common/dto/community-list-query.dto';
import { DiscListReaderCriteria } from 'src/community/common/types/disc-list-reader-criteria';
import { User } from 'src/identity/auth/entities/user.entity';
import { RatesService } from '../../rates.service';
import { RatesDiscListReader } from '../rates-disc-list.reader';

describe('RatesDiscListReader', () => {
  it.each([
    ['rates', 'rate', 'myRateDesc', 'rate.rate:DESC,disc.releaseDate:DESC'],
    ['covers', 'cover', 'myCoverAsc', 'rate.cover:ASC,artist.name:ASC'],
  ] as const)(
    'delegates %s to the Rates owner with the matching eligibility and sort',
    async (mode, type, sort, orderBy) => {
      const findAllByUser: jest.Mock<
        ReturnType<RatesService['findAllByUser']>,
        Parameters<RatesService['findAllByUser']>
      > = jest.fn().mockResolvedValue({
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        limit: 20,
        data: [],
      });
      const reader = new RatesDiscListReader({
        findAllByUser,
        findDiscListOptions: jest.fn(),
      });
      const criteria: DiscListReaderCriteria = {
        limit: 20,
        offset: 40,
        query: 'album',
        dateRange: [new Date('2026-01-01'), new Date('2026-12-31')],
        countryId: 'country-uuid',
        genreId: 'genre-uuid',
        sort,
      };
      const user = Object.assign(new User(), { id: 'session-user' });

      await expect(
        reader.findByUser(mode, criteria, user),
      ).resolves.toMatchObject({
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        limit: 20,
        data: [],
      });
      expect(findAllByUser).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 40,
          query: 'album',
          dateRange: criteria.dateRange,
          country: 'country-uuid',
          genre: 'genre-uuid',
          type,
          orderBy,
        }),
        user,
        { stableTieBreak: true },
      );
    },
  );

  it('keeps the established release-date default when no sort was requested', async () => {
    const findAllByUser: jest.Mock<
      ReturnType<RatesService['findAllByUser']>,
      Parameters<RatesService['findAllByUser']>
    > = jest.fn().mockResolvedValue({
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      limit: 20,
      data: [],
    });
    const reader = new RatesDiscListReader({
      findAllByUser,
      findDiscListOptions: jest.fn(),
    });
    const user = Object.assign(new User(), { id: 'user-1' });

    await reader.findByUser('rates', { limit: 20, offset: 0 }, user);

    const [query] = findAllByUser.mock.calls[0];
    expect(query).toBeInstanceOf(CommunityListQueryDto);
    expect(query.orderBy).toBeUndefined();
  });
});
