import { Repository } from 'typeorm';
import { Disc } from '../entities/disc.entity';
import { DiscEnrichmentService } from './disc-enrichment.service';

describe('DiscEnrichmentService.findWeeklyWithoutImage', () => {
  let service: DiscEnrichmentService;
  let repository: { createQueryBuilder: jest.Mock };
  let queryBuilder: Record<string, jest.Mock>;

  beforeEach(() => {
    queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    service = new DiscEnrichmentService(repository as unknown as Repository<Disc>);
  });

  it('queries the whole month when week is omitted with inclusive date bounds', async () => {
    await service.findWeeklyWithoutImage(5, 2024);

    expect(repository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(repository.createQueryBuilder).toHaveBeenCalledWith('disc');
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'disc.releaseDate BETWEEN :start AND :end',
      { start: '2024-05-01', end: '2024-05-31' },
    );
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('narrows the date bounds to the requested weekly range', async () => {
    await service.findWeeklyWithoutImage(5, 2024, 3);

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'disc.releaseDate BETWEEN :start AND :end',
      { start: '2024-05-17', end: '2024-05-23' },
    );
  });

  it('uses a left artist join, selects only consumed fields, and preserves ordering', async () => {
    await service.findWeeklyWithoutImage(5, 2024);

    expect(queryBuilder.leftJoin).toHaveBeenCalledTimes(1);
    expect(queryBuilder.leftJoin).toHaveBeenCalledWith('disc.artist', 'artist');
    expect(queryBuilder.select).toHaveBeenCalledWith('disc.id', 'id');
    expect(queryBuilder.addSelect.mock.calls).toEqual([
      ['disc.name', 'name'],
      ['artist.name', 'artistName'],
    ]);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('disc.releaseDate', 'ASC');
  });

  it('filters only null or empty images and returns the current three-field payload', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      { id: 'disc-null-image', artistName: 'Artist A', name: 'Album A' },
      { id: 'disc-empty-image', artistName: 'Artist B', name: 'Album B' },
      { id: 'disc-without-artist', artistName: null, name: 'Album C' },
    ]);

    await expect(service.findWeeklyWithoutImage(5, 2024)).resolves.toEqual([
      { id: 'disc-null-image', artistName: 'Artist A', name: 'Album A' },
      { id: 'disc-empty-image', artistName: 'Artist B', name: 'Album B' },
      { id: 'disc-without-artist', artistName: '', name: 'Album C' },
    ]);
    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(disc.image IS NULL OR disc.image = :empty)',
      { empty: '' },
    );
  });

  it('returns an empty array when the query finds no eligible discs', async () => {
    queryBuilder.getRawMany.mockResolvedValue([]);

    await expect(service.findWeeklyWithoutImage(5, 2024)).resolves.toEqual([]);
    expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('does not query when the requested week does not exist', async () => {
    await expect(service.findWeeklyWithoutImage(5, 2024, 99)).resolves.toEqual([]);

    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });
});

describe('DiscEnrichmentService.updateImage', () => {
  let service: DiscEnrichmentService;
  let discRepository: { update: jest.Mock };

  beforeEach(() => {
    discRepository = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    service = new DiscEnrichmentService(discRepository as unknown as Repository<Disc>);
  });

  it('updates only the image by disc id and returns undefined', async () => {
    const image = 'https://images.example/album.jpg';

    await expect(service.updateImage('disc-id', image)).resolves.toBeUndefined();

    expect(discRepository.update).toHaveBeenCalledTimes(1);
    expect(discRepository.update).toHaveBeenCalledWith('disc-id', { image });
  });

  it('silently returns undefined when no disc matches the id', async () => {
    discRepository.update.mockResolvedValue({ affected: 0 });

    await expect(service.updateImage('missing-disc-id', 'https://image.test/a.jpg'))
      .resolves.toBeUndefined();

    expect(discRepository.update).toHaveBeenCalledTimes(1);
    expect(discRepository.update).toHaveBeenCalledWith(
      'missing-disc-id',
      { image: 'https://image.test/a.jpg' },
    );
  });

  it('allows an empty image string and passes it unchanged to the repository', async () => {
    await expect(service.updateImage('disc-id', '')).resolves.toBeUndefined();

    expect(discRepository.update).toHaveBeenCalledWith('disc-id', { image: '' });
  });

  it('forwards null at runtime although the method type only accepts strings', async () => {
    await expect(service.updateImage('disc-id', null as any)).resolves.toBeUndefined();

    expect(discRepository.update).toHaveBeenCalledWith('disc-id', { image: null });
  });
});
