import { ContentsService } from './contents.service';
import { ListStatus } from 'src/lists/entities/list.entity';

describe('ContentsService', () => {
  it('incluye en el backlog los contenidos de listas completadas', async () => {
    const contentRepo = { find: jest.fn().mockResolvedValue([]) };
    const service = new ContentsService(
      contentRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.findAll(undefined, true);

    expect(contentRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [{ backlog: true }, { list: { status: ListStatus.COMPLETED } }],
      }),
    );
  });
});
