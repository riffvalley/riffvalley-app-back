import { restoreRandomDiscOrder } from './restore-random-disc-order';

describe('restoreRandomDiscOrder', () => {
  it('restores the selected random ID order without mutating hydrated entities', () => {
    const discs = [{ id: 'disc-c' }, { id: 'disc-a' }, { id: 'unlisted' }, { id: 'disc-b' }];

    expect(restoreRandomDiscOrder(discs, ['disc-a', 'disc-b', 'disc-c'])).toEqual([
      { id: 'disc-a' },
      { id: 'disc-b' },
      { id: 'disc-c' },
      { id: 'unlisted' },
    ]);
    expect(discs.map(({ id }) => id)).toEqual(['disc-c', 'disc-a', 'unlisted', 'disc-b']);
  });
});
