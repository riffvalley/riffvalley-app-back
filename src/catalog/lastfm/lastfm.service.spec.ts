import { InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DiscsService } from 'src/catalog/discs/discs.service';
import { LastfmApiService } from 'src/integrations/lastfm-integration/lastfm-api.service';
import { LastfmService } from './lastfm.service';

describe('LastfmService Catalog orchestration', () => {
  let service: LastfmService;
  let discsService: {
    findWeeklyWithoutImage: jest.Mock;
    updateImage: jest.Mock;
  };
  let lastfmApiService: {
    assertConfigured: jest.Mock;
    getArtistInfo: jest.Mock;
    getAlbumImage: jest.Mock;
  };

  beforeEach(async () => {
    discsService = {
      findWeeklyWithoutImage: jest.fn(),
      updateImage: jest.fn().mockResolvedValue(undefined),
    };
    lastfmApiService = {
      assertConfigured: jest.fn(),
      getArtistInfo: jest.fn(),
      getAlbumImage: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        LastfmService,
        { provide: DiscsService, useValue: discsService },
        { provide: LastfmApiService, useValue: lastfmApiService },
      ],
    }).compile();

    service = module.get(LastfmService);
  });

  it('delegates artist reads to Last.fm and returns its payload unchanged', async () => {
    const artist = { name: 'Artist', stats: { listeners: '42' } };
    lastfmApiService.getArtistInfo.mockResolvedValue(artist);

    await expect(service.getArtistInfo('Artist')).resolves.toBe(artist);
    expect(lastfmApiService.getArtistInfo).toHaveBeenCalledWith('Artist');
  });

  it('keeps image lookup orchestration and Catalog writes local', async () => {
    const discs = [
      { id: '1', artistName: 'Artist one', name: 'Album one' },
      { id: '2', artistName: 'Artist two', name: 'Album two' },
    ];
    discsService.findWeeklyWithoutImage.mockResolvedValue(discs);
    lastfmApiService.getAlbumImage
      .mockResolvedValueOnce('https://img.test/album-one.jpg')
      .mockResolvedValueOnce(null);

    await expect(service.fillWeeklyImages(5, 2024, 3)).resolves.toEqual({
      updated: 1,
      notFound: ['Artist two - Album two'],
    });
    expect(lastfmApiService.assertConfigured).toHaveBeenCalledTimes(1);
    expect(discsService.findWeeklyWithoutImage).toHaveBeenCalledWith(5, 2024, 3);
    expect(lastfmApiService.getAlbumImage).toHaveBeenNthCalledWith(
      1,
      'Artist one',
      'Album one',
    );
    expect(lastfmApiService.getAlbumImage).toHaveBeenNthCalledWith(
      2,
      'Artist two',
      'Album two',
    );
    expect(discsService.updateImage).toHaveBeenCalledTimes(1);
    expect(discsService.updateImage).toHaveBeenCalledWith(
      '1',
      'https://img.test/album-one.jpg',
    );
  });

  it('checks configuration before querying Catalog and preserves the empty result', async () => {
    discsService.findWeeklyWithoutImage.mockResolvedValue([]);

    await expect(service.fillWeeklyImages(5, 2024)).resolves.toEqual({
      updated: 0,
      notFound: [],
    });
    expect(lastfmApiService.assertConfigured).toHaveBeenCalledTimes(1);
    expect(discsService.findWeeklyWithoutImage).toHaveBeenCalledWith(5, 2024, undefined);
    expect(lastfmApiService.getAlbumImage).not.toHaveBeenCalled();

    lastfmApiService.assertConfigured.mockImplementation(() => {
      throw new InternalServerErrorException('LASTFM_API_KEY not configured');
    });
    await expect(service.fillWeeklyImages(5, 2024)).rejects.toThrow(
      new InternalServerErrorException('LASTFM_API_KEY not configured'),
    );
    expect(discsService.findWeeklyWithoutImage).toHaveBeenCalledTimes(1);
  });
});
