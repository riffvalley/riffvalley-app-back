import {
  BadGatewayException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { FestivalSetlistService } from '../festival-setlist.service';

describe('FestivalSetlistService', () => {
  let service: FestivalSetlistService;
  let testingModule: TestingModule;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(async () => {
    configService = { get: jest.fn().mockReturnValue('test-api-key') };
    testingModule = await Test.createTestingModule({
      providers: [
        FestivalSetlistService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = testingModule.get(FestivalSetlistService);
  });

  afterEach(async () => {
    await testingModule.close();
    jest.restoreAllMocks();
  });

  it('orders recent setlists and counts each normalized, non-tape song once per concert', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        setlist: [
          {
            eventDate: '01-01-2024',
            url: 'https://setlist.fm/old',
            sets: { set: [{ song: [{ name: 'Old song' }] }] },
          },
          {
            eventDate: '02-08-2026',
            url: 'https://setlist.fm/newest',
            sets: {
              set: [
                {
                  song: [
                    { name: 'Hít' },
                    { name: 'Hit' },
                    { name: 'Intro', tape: true },
                    { name: 'Newest first' },
                  ],
                },
              ],
            },
          },
          {
            eventDate: '01-08-2026',
            url: 'https://setlist.fm/recent',
            sets: { set: [{ song: [{ name: 'Hit' }, { name: 'Second' }] }] },
          },
        ],
      }),
    } as Response);

    const result = await service.getTopSongs('Test Artist', 10, 2);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.setlist.fm/rest/1.0/search/setlists?artistName=Test+Artist&p=1',
      {
        headers: { Accept: 'application/json', 'x-api-key': 'test-api-key' },
      },
    );
    expect(result).toEqual({
      artist: 'Test Artist',
      setlistsAnalyzed: 2,
      songs: [
        { name: 'Hít', plays: 2 },
        { name: 'Newest first', plays: 1 },
        { name: 'Second', plays: 1 },
      ],
      sources: ['https://setlist.fm/newest', 'https://setlist.fm/recent'],
    });
  });

  it('limits aggregated songs while keeping first-seen order for ties', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        setlist: [
          {
            eventDate: '02-08-2026',
            sets: { set: [{ song: [{ name: 'First' }, { name: 'Second' }] }] },
          },
        ],
      }),
    } as Response);

    await expect(service.getTopSongs('Artist', 1, 10)).resolves.toEqual({
      artist: 'Artist',
      setlistsAnalyzed: 1,
      songs: [{ name: 'First', plays: 1 }],
      sources: [],
    });
  });

  it('orders setlists without a date after dated setlists', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        setlist: [
          {
            url: 'https://setlist.fm/undated',
            sets: { set: [{ song: [{ name: 'Undated song' }] }] },
          },
          {
            eventDate: '02-01-2000',
            url: 'https://setlist.fm/dated',
            sets: { set: [{ song: [{ name: 'Dated song' }] }] },
          },
        ],
      }),
    } as Response);

    await expect(service.getTopSongs('Artist', 10, 1)).resolves.toEqual({
      artist: 'Artist',
      setlistsAnalyzed: 1,
      songs: [{ name: 'Dated song', plays: 1 }],
      sources: ['https://setlist.fm/dated'],
    });
  });

  it.each([
    ['missing setlist field', undefined],
    ['empty setlist field', []],
    ['setlist without songs', [{ sets: { set: [] } }]],
  ] as const)(
    'returns 404 when no songs are available (%s)',
    async (_scenario, setlist) => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ setlist }),
      } as Response);

      await expect(service.getTopSongs('Artist')).rejects.toThrow(
        new NotFoundException(
          'No hay setlists recientes con canciones para Artist',
        ),
      );
    },
  );

  it('maps a non-successful setlist.fm response to the existing 502 error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(service.getTopSongs('Artist')).rejects.toThrow(
      new BadGatewayException('setlist.fm respondió con 503'),
    );
  });

  it('preserves fetch errors and reports missing API configuration', async () => {
    const fetchError = new Error('network failure');
    jest.spyOn(global, 'fetch').mockRejectedValue(fetchError);
    await expect(service.getTopSongs('Artist')).rejects.toBe(fetchError);

    configService.get.mockReturnValue(undefined);
    await expect(service.getTopSongs('Artist')).rejects.toThrow(
      new InternalServerErrorException('SETLISTFM_API_KEY no está configurada'),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
