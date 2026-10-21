import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { UserRoleGuard } from '../../identity/auth/guards/user-role/user-role.guard';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';

type VersionsControllerService = Pick<
  VersionsService,
  | 'create'
  | 'listIndependentItems'
  | 'listCurrentVersionItems'
  | 'createItem'
  | 'updateItem'
  | 'removeItem'
  | 'findPublic'
  | 'findDevStatus'
  | 'findLatestDraft'
  | 'findProductionPaginated'
  | 'findLatestProductionVersion'
  | 'findAll'
  | 'findOne'
  | 'update'
  | 'remove'
  | 'listItems'
  | 'setActive'
>;

describe('VersionsController', () => {
  let controller: VersionsController;

  beforeEach(async () => {
    const versionsServiceMock: jest.Mocked<VersionsControllerService> = {
      create: jest.fn(),
      listIndependentItems: jest.fn(),
      listCurrentVersionItems: jest.fn(),
      createItem: jest.fn(),
      updateItem: jest.fn(),
      removeItem: jest.fn(),
      findPublic: jest.fn(),
      findDevStatus: jest.fn(),
      findLatestDraft: jest.fn(),
      findProductionPaginated: jest.fn(),
      findLatestProductionVersion: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      listItems: jest.fn(),
      setActive: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VersionsController],
      providers: [{ provide: VersionsService, useValue: versionsServiceMock }],
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    })
      .overrideGuard(UserRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VersionsController>(VersionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
