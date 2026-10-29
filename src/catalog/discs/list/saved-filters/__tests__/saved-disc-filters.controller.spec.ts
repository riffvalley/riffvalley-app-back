import { Reflector } from '@nestjs/core';
import { CreateSavedDiscFilterDto } from '../dto/saved-disc-filter.dto';
import { META_MINIMUM_ROLE } from 'src/identity/authorization/decorators/role-protected.decorator';
import { User } from 'src/identity/auth/entities/user.entity';
import { SavedDiscFiltersController } from '../saved-disc-filters.controller';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const FILTER_ID = '00000000-0000-4000-8000-000000000002';

describe('SavedDiscFiltersController', () => {
  const service = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const controller = new SavedDiscFiltersController(service);
  const user = Object.assign(new User(), { id: USER_ID });

  beforeEach(() => jest.clearAllMocks());

  it('requires authentication on the saved-filters collection', () => {
    const reflector = new Reflector();
    expect(
      reflector.get(META_MINIMUM_ROLE, SavedDiscFiltersController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('__guards__', SavedDiscFiltersController),
    ).toHaveLength(2);
  });

  it('uses only the session user for list and create', async () => {
    service.findAll.mockResolvedValue([]);
    service.create.mockResolvedValue({ id: FILTER_ID });
    const dto = Object.assign(new CreateSavedDiscFilterDto(), {
      name: 'Metal',
      filters: {},
    });

    await controller.findAll(user);
    await controller.create(dto, user);

    expect(service.findAll).toHaveBeenCalledWith(USER_ID);
    expect(service.create).toHaveBeenCalledWith(USER_ID, dto);
  });

  it('scopes updates and deletes to the session user', async () => {
    service.update.mockResolvedValue({ id: FILTER_ID });
    service.remove.mockResolvedValue(undefined);

    await controller.update(FILTER_ID, { name: 'Nuevo' }, user);
    await controller.remove(FILTER_ID, user);

    expect(service.update).toHaveBeenCalledWith(USER_ID, FILTER_ID, {
      name: 'Nuevo',
    });
    expect(service.remove).toHaveBeenCalledWith(USER_ID, FILTER_ID);
  });
});
