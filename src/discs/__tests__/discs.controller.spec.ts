import { DiscsController } from '../discs.controller';
import { DiscsService } from '../discs.service';

describe('DiscsController baseline', () => {
  let controller: DiscsController;
  let discsService: {
    findAll: jest.Mock;
    findRandom: jest.Mock;
    findOptions: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(() => {
    discsService = {
      findAll: jest.fn(),
      findRandom: jest.fn(),
      findOptions: jest.fn(),
      findOne: jest.fn(),
    };
    controller = new DiscsController(discsService as unknown as DiscsService);
  });

  it('delegates query and authenticated user and returns the service response unchanged', async () => {
    const pagination = { limit: 0, query: 'album' } as any;
    const user = { id: 'user-id' } as any;
    const response = { totalItems: 0, data: [] };
    discsService.findAll.mockResolvedValue(response);

    await expect(controller.findAll(pagination, user)).resolves.toBe(response);
    expect(discsService.findAll).toHaveBeenCalledWith(pagination, user);
  });

  it('delegates the path id and returns the service response unchanged', async () => {
    const disc = { id: 'disc-id', name: 'Album' };
    discsService.findOne.mockResolvedValue(disc);

    await expect(controller.findOne('disc-id')).resolves.toBe(disc);
    expect(discsService.findOne).toHaveBeenCalledWith('disc-id');
  });

  it('delegates random catalog queries with the authenticated user', async () => {
    const dto = { limit: 3 } as any;
    const user = { id: 'user-id' } as any;
    const response = [{ id: 'disc-id' }];
    discsService.findRandom.mockResolvedValue(response);

    await expect(controller.findRandom(dto, user)).resolves.toBe(response);
    expect(discsService.findRandom).toHaveBeenCalledWith(dto, user);
  });

  it('delegates catalog option queries and returns their response unchanged', async () => {
    const dto = { field: 'genre' } as any;
    const response = [{ id: 'genre-id', name: 'Genre' }];
    discsService.findOptions.mockResolvedValue(response);

    await expect(controller.findOptions(dto)).resolves.toBe(response);
    expect(discsService.findOptions).toHaveBeenCalledWith(dto);
  });
});
