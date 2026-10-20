import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from '../../../communications/mail/mail.service';
import { Disc } from '../../../catalog/discs/entities/disc.entity';
import { NationalRelease, DiscType } from '../entities/national-release.entity';
import { NationalReleasesService } from '../national-releases.service';

describe('NationalReleasesService admin suggestion batching', () => {
  let moduleRef: TestingModule;
  let service: NationalReleasesService;

  const releasesQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getRawMany: jest.fn(),
  };
  const suggestionQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  let releaseQueryCount: number;

  const nationalReleaseRepository = {
    createQueryBuilder: jest.fn(() => {
      releaseQueryCount += 1;
      return releasesQueryBuilder;
    }),
  };
  const discRepository = {
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => suggestionQueryBuilder),
  };

  const makeRelease = (
    id: string,
    discType: DiscType,
    discId: string | null = null,
  ): NationalRelease => ({
    id,
    artistName: `Artist ${id}`,
    discName: `Album ${id}`,
    discType,
    genre: 'Rock',
    releaseDay: new Date('2026-05-01'),
    publishAt: null,
    link: null,
    approved: false,
    discId,
    disc: null,
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    updatedAt: new Date('2026-05-01T10:00:00.000Z'),
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    releaseQueryCount = 0;
    releasesQueryBuilder.getMany.mockResolvedValue([]);
    releasesQueryBuilder.getRawMany.mockResolvedValue([{ month: 5 }]);
    suggestionQueryBuilder.getMany.mockReset().mockResolvedValue([]);
    discRepository.query.mockReset().mockResolvedValue([]);

    moduleRef = await Test.createTestingModule({
      providers: [
        NationalReleasesService,
        {
          provide: getRepositoryToken(NationalRelease),
          useValue: nationalReleaseRepository,
        },
        {
          provide: getRepositoryToken(Disc),
          useValue: discRepository,
        },
        { provide: MailService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(NationalReleasesService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('runs no Disc suggestion query when the admin result has no releases', async () => {
    await expect(service.findAllAdmin()).resolves.toEqual({
      data: [],
      pendingMonths: [5],
    });

    expect(nationalReleaseRepository.createQueryBuilder).toHaveBeenCalledTimes(
      2,
    );
    expect(releaseQueryCount).toBe(2);
    expect(discRepository.query).not.toHaveBeenCalled();
    expect(discRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('loads one matched suggestion with a bounded pair of Disc queries', async () => {
    const release = makeRelease('first', DiscType.ALBUM);
    const disc = { id: 'disc-first', name: release.discName };
    releasesQueryBuilder.getMany.mockResolvedValue([release]);
    discRepository.query.mockResolvedValueOnce([
      { releaseId: release.id, discId: disc.id },
    ]);
    suggestionQueryBuilder.getMany.mockResolvedValueOnce([disc]);

    const result = await service.findAllAdmin();

    expect(releaseQueryCount).toBe(2);
    expect(discRepository.query).toHaveBeenCalledTimes(1);
    expect(discRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([{ ...release, suggestedDisc: disc }]);
  });

  it('batches candidates, preserves nulls, linked releases and list order', async () => {
    const first = makeRelease('first', DiscType.ALBUM);
    const second = makeRelease('second', DiscType.EP);
    const third = makeRelease('third', DiscType.ALBUM);
    const linked = makeRelease('linked', DiscType.ALBUM, 'existing-disc');
    const single = makeRelease('single', DiscType.SINGLE);
    const firstDisc = { id: 'disc-first', name: first.discName };
    const thirdDisc = { id: 'disc-third', name: third.discName };
    releasesQueryBuilder.getMany.mockResolvedValue([
      first,
      second,
      linked,
      single,
      third,
    ]);
    discRepository.query.mockResolvedValueOnce([
      { releaseId: first.id, discId: firstDisc.id },
      { releaseId: second.id, discId: null },
      { releaseId: third.id, discId: thirdDisc.id },
    ]);
    suggestionQueryBuilder.getMany.mockResolvedValueOnce([
      firstDisc,
      thirdDisc,
    ]);

    const result = await service.findAllAdmin();

    expect(releaseQueryCount).toBe(2);
    expect(discRepository.query).toHaveBeenCalledTimes(1);
    expect(discRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([
      { ...first, suggestedDisc: firstDisc },
      { ...second, suggestedDisc: null },
      { ...linked, suggestedDisc: null },
      { ...single, suggestedDisc: null },
      { ...third, suggestedDisc: thirdDisc },
    ]);
  });

  it('keeps the selected candidate for multiple matching discs and bounds query count as list size grows', async () => {
    const releases = Array.from({ length: 60 }, (_, index) =>
      makeRelease(`release-${index}`, DiscType.ALBUM),
    );
    const selectedDiscs = releases.map((release, index) => ({
      id: `selected-${index}`,
      name: release.discName,
    }));
    releasesQueryBuilder.getMany.mockResolvedValue(releases);
    discRepository.query.mockResolvedValueOnce(
      releases.map((release, index) => ({
        releaseId: release.id,
        // The database's per-key LIMIT 1 result is the selection contract.
        discId: selectedDiscs[index].id,
      })),
    );
    suggestionQueryBuilder.getMany.mockResolvedValueOnce(selectedDiscs);

    const result = await service.findAllAdmin();

    expect(result.data).toEqual(
      releases.map((release, index) => ({
        ...release,
        suggestedDisc: selectedDiscs[index],
      })),
    );
    expect(releaseQueryCount + 1 + 1).toBe(4);
    expect(discRepository.query).toHaveBeenCalledTimes(1);
    expect(discRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(discRepository.query.mock.calls[0][0]).toContain(
      'LEFT JOIN LATERAL',
    );
    expect(discRepository.query.mock.calls[0][0]).toContain('LIMIT 1');
  });
});
