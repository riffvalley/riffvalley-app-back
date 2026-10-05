import { CommentsService } from './comments.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
      findOneOrFail: jest.fn(),
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

  it('returns 404 when the disc does not exist during creation', async () => {
    repository.manager.findOne.mockResolvedValue(null);

    await expect(service.create({ comment: 'Great record', discId: 'missing-disc' } as any, user))
      .rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 when the parent comment does not exist', async () => {
    repository.manager.findOne.mockResolvedValue(disc);
    repository.findOne.mockResolvedValue(null);

    await expect(service.create({ comment: 'Reply', discId: disc.id, parentId: 'missing-parent' } as any, user))
      .rejects.toMatchObject({ status: 404 });
  });

  it('keeps duplicate database errors at 400 and masks unexpected errors as 500', async () => {
    repository.manager.findOne.mockResolvedValue(disc);
    repository.save.mockRejectedValueOnce({ code: '23505', detail: 'duplicate key value' });
    await expect(service.create({ comment: 'Duplicate', discId: disc.id } as any, user))
      .rejects.toMatchObject({ status: 400 });

    repository.save.mockRejectedValueOnce(new Error('private database details'));
    await expect(service.create({ comment: 'Unexpected', discId: disc.id } as any, user))
      .rejects.toMatchObject({
        status: 500,
        response: { message: 'An unexpected error occurred' },
      });
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
      id: 'comment-1', comment: 'Visible', isDeleted: false, createdAt: new Date('2024-01-01'), editedAt: null,
      parent: null, user: { id: 'user-1', username: 'listener', image: 'avatar.png' },
      disc: { id: disc.id, name: disc.name },
    };
    const reply = {
      id: 'comment-2', comment: 'Reply', isDeleted: false, editedAt: null,
      parent: { id: 'comment-1' }, user: { id: 'user-2', username: 'friend', image: null },
      disc: { id: disc.id, name: disc.name },
    };
    const deleted = {
      id: 'comment-3', comment: 'Former text', isDeleted: true, editedAt: null,
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
        createdAt: normal.createdAt, editedAt: null, parentId: null,
        user: { id: 'user-1', username: 'listener', image: 'avatar.png' },
        disc: { id: disc.id, name: disc.name },
      },
      {
        id: 'comment-2', comment: 'Reply', isDeleted: false, editedAt: null, parentId: 'comment-1',
        user: { id: 'user-2', username: 'friend', image: null },
        disc: { id: disc.id, name: disc.name },
      },
      {
        id: 'comment-3', comment: 'Comentario eliminado', isDeleted: true, editedAt: null, parentId: null,
        user: { id: 'user-3', username: 'former', image: null },
        disc: { id: disc.id, name: disc.name },
      },
    ]);
  });

  it('returns 404 when reading comments for a missing disc', async () => {
    repository.manager.findOne.mockResolvedValue(null);
    await expect(service.findCommentsByDisc('missing-disc')).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['with replies', [{ id: 'reply-1' }], { message: 'Comment with id comment-1 has been marked as deleted (soft delete)' }],
    ['without replies', [], { message: 'Comment with id comment-1 has been permanently deleted' }],
  ])('preserves the delete result %s', async (_case, replies, expected) => {
    repository.findOne.mockResolvedValue({ id: 'comment-1', comment: 'Original', replies, user });

    const result = await service.remove('comment-1', user);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'comment-1' },
      relations: ['replies', 'user'],
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

  it('allows the owner to read and edit a comment by id', async () => {
    const comment = { id: 'comment-1', user };
    repository.findOneOrFail.mockResolvedValue(comment);
    repository.findOne.mockResolvedValue(comment);
    repository.preload.mockResolvedValue(comment);

    await expect(service.findOne(comment.id, user)).resolves.toBe(comment);
    await expect(service.update(comment.id, { comment: 'Edited' } as any, user)).resolves.toBe(comment);
    expect(repository.save).toHaveBeenCalledWith(comment);
  });

  it.each([
    ['read', () => service.findOne('comment-1', { id: 'other-user' } as any)],
    ['edit', () => service.update('comment-1', { comment: 'Edited' } as any, { id: 'other-user' } as any)],
    ['delete', () => service.remove('comment-1', { id: 'other-user' } as any)],
  ])('returns 403 when a non-owner tries to %s a comment', async (_operation, action) => {
    repository.findOneOrFail.mockResolvedValue({ id: 'comment-1', user });
    repository.findOne.mockResolvedValue({ id: 'comment-1', user, replies: [] });

    await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['read', () => service.findOne('missing', user)],
    ['edit', () => service.update('missing', { comment: 'Edited' } as any, user)],
    ['delete', () => service.remove('missing', user)],
  ])('returns 404 when a comment to %s does not exist', async (_operation, action) => {
    repository.findOneOrFail.mockRejectedValue(new Error('missing'));
    repository.findOne.mockResolvedValue(null);

    await expect(action()).rejects.toBeInstanceOf(NotFoundException);
  });
});
