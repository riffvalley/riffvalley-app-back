import { CommentsService } from './comments.service';
describe('CommentsService characterization', () => {
  const user = { id: 'user-1', username: 'listener' } as any;
  const disc = { id: 'disc-1', name: 'Album' } as any;
  let repository: any;
  let service: CommentsService;

  beforeEach(() => {
    repository = {
      manager: { findOne: jest.fn() },
      create: jest.fn((values) => ({ id: 'comment-1', ...values })),
      save: jest.fn(async (comment) => comment),
      findOne: jest.fn(),
      findOneByOrFail: jest.fn(),
      preload: jest.fn(),
      delete: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    service = new CommentsService(repository);
  });

  it('creates a top-level comment attached to the authenticated user and disc', async () => {
    repository.manager.findOne.mockResolvedValue(disc);
    repository.findOne.mockResolvedValue(null);

    const result = await service.create(
      { comment: 'Great record', discId: disc.id } as any,
      user,
    );

    expect(repository.create).toHaveBeenCalledWith({
      comment: 'Great record',
      user,
      disc,
      parent: null,
    });
    expect(repository.save).toHaveBeenCalledWith(result);
    expect(result).toMatchObject({ id: 'comment-1', comment: 'Great record', user, disc, parent: null });
  });

  it('creates a reply attached to its parent comment', async () => {
    const parent = { id: 'parent-1', comment: 'Original' };
    repository.manager.findOne.mockResolvedValue(disc);
    repository.findOne.mockResolvedValue(parent);

    const result = await service.create(
      { comment: 'Reply', discId: disc.id, parentId: parent.id } as any,
      user,
    );

    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: parent.id } });
    expect(repository.create).toHaveBeenCalledWith({
      comment: 'Reply',
      user,
      disc,
      parent,
    });
    expect(result).toMatchObject({ comment: 'Reply', user, disc, parent });
  });

  it('returns the current paginated user comment envelope with its disc relation', async () => {
    const comments = [{ id: 'comment-1', comment: 'Great record', disc }];
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(comments),
      getCount: jest.fn().mockResolvedValue(1),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.findAllByUser({ limit: 10, offset: 0 } as any, user);

    expect(result).toEqual({
      totalItems: 1,
      totalPages: 1,
      currentPage: 1,
      limit: 10,
      data: comments,
    });
    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('comment.disc', 'disc');
    expect(queryBuilder.getMany).toHaveBeenCalledTimes(1);
    expect(queryBuilder.getCount).toHaveBeenCalledTimes(1);
  });

  it('projects a comment, reply, and deleted comment for the disc reader', async () => {
    const normal = {
      id: 'comment-1', comment: 'Visible', isDeleted: false, createdAt: new Date('2024-01-01'),
      parent: null, user: { id: 'user-1', username: 'listener', image: 'avatar.png' },
      disc: { id: disc.id, name: disc.name },
    };
    const reply = {
      id: 'comment-2', comment: 'Reply', isDeleted: false,
      parent: { id: 'comment-1' }, user: { id: 'user-2', username: 'friend', image: null },
      disc: { id: disc.id, name: disc.name },
    };
    const deleted = {
      id: 'comment-3', comment: 'Former text', isDeleted: true,
      parent: null, user: { id: 'user-3', username: 'former', image: null },
      disc: { id: disc.id, name: disc.name },
    };
    repository.manager.findOne.mockResolvedValue(disc);
    repository.find.mockResolvedValue([normal, reply, deleted]);

    const result = await service.findCommentsByDisc(disc.id);

    expect(repository.find).toHaveBeenCalledWith({
      where: { disc: { id: disc.id } },
      relations: ['user', 'parent', 'disc'],
    });
    expect(result).toEqual([
      {
        id: 'comment-1', comment: 'Visible', isDeleted: false,
        createdAt: normal.createdAt, parentId: null,
        user: { id: 'user-1', username: 'listener', image: 'avatar.png' },
        disc: { id: disc.id, name: disc.name },
      },
      {
        id: 'comment-2', comment: 'Reply', isDeleted: false, parentId: 'comment-1',
        user: { id: 'user-2', username: 'friend', image: null },
        disc: { id: disc.id, name: disc.name },
      },
      {
        id: 'comment-3', comment: 'Comentario eliminado', isDeleted: true, parentId: null,
        user: { id: 'user-3', username: 'former', image: null },
        disc: { id: disc.id, name: disc.name },
      },
    ]);
  });

  it.each([
    ['with replies', [{ id: 'reply-1' }], { message: 'Comment with id comment-1 has been marked as deleted (soft delete)' }],
    ['without replies', [], { message: 'Comment with id comment-1 has been permanently deleted' }],
  ])('preserves the delete result %s', async (_case, replies, expected) => {
    repository.findOne.mockResolvedValue({ id: 'comment-1', comment: 'Original', replies });

    const result = await service.remove('comment-1');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
      relations: ['replies'],
    });
    expect(result).toEqual(expected);
    if (replies.length) {
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
        id: 'comment-1', isDeleted: true, comment: 'Comentario eliminado',
      }));
      expect(repository.delete).not.toHaveBeenCalled();
    } else {
      expect(repository.delete).toHaveBeenCalledWith('comment-1');
      expect(repository.save).not.toHaveBeenCalled();
    }
  });
});
